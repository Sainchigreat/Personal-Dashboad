import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db, id, now } from "./db";

type Session = { user_id: string; email: string };
type Member = { workspace_id: string; role: "owner" | "manager" | "member"; status: string };
const router = Router();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
function session(res: Response): Session { return res.locals.session as Session; }
function membership(userId: string): Member | undefined {
  return db.prepare("SELECT workspace_id,role,status FROM team_members WHERE user_id=?").get(userId) as Member | undefined;
}
function requireMember(_req: Request,res: Response,next: NextFunction) {
  const member = membership(session(res).user_id);
  if (!member || member.status !== "active") return res.status(403).json({error:"You do not have access to a Team Workspace."});
  res.locals.teamMember = member;
  return next();
}
function requireManager(_req: Request,res: Response,next: NextFunction) {
  const member = res.locals.teamMember as Member;
  if (!["owner","manager"].includes(member.role)) return res.status(403).json({error:"Only the owner or a manager can perform this action."});
  return next();
}
function log(member: Member,userId: string,action: string,type: string,entityId: string,summary: string) {
  db.prepare("INSERT INTO team_activity(id,workspace_id,actor_user_id,action,entity_type,entity_id,summary,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id(),member.workspace_id,userId,action,type,entityId,summary,now());
}
router.use(requireMember);
router.get("/bootstrap",(_req,res)=>{
  const userId=session(res).user_id, member=res.locals.teamMember as Member, wid=member.workspace_id;
  const goals=db.prepare("SELECT g.*,u.email AS owner_email FROM team_goals g LEFT JOIN users u ON u.id=g.owner_user_id WHERE g.workspace_id=? ORDER BY g.created_at DESC").all(wid);
  const tasks=db.prepare("SELECT t.*,a.email AS assignee_email,r.email AS reviewer_email,g.title AS goal_title FROM team_tasks t JOIN users a ON a.id=t.assignee_user_id LEFT JOIN users r ON r.id=t.reviewer_user_id LEFT JOIN team_goals g ON g.id=t.goal_id WHERE t.workspace_id=? AND (? IN ('owner','manager') OR t.assignee_user_id=?) ORDER BY CASE t.status WHEN 'submitted' THEN 0 WHEN 'revision_requested' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,t.due_date").all(wid,member.role,userId);
  const members=db.prepare("SELECT m.user_id,m.role,m.status,m.joined_at,u.email,s.name FROM team_members m JOIN users u ON u.id=m.user_id LEFT JOIN settings s ON s.user_id=u.id WHERE m.workspace_id=? ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,s.name").all(wid);
  const activity=db.prepare("SELECT a.*,u.email,s.name FROM team_activity a JOIN users u ON u.id=a.actor_user_id LEFT JOIN settings s ON s.user_id=u.id WHERE a.workspace_id=? ORDER BY a.created_at DESC LIMIT 50").all(wid);
  const comments=db.prepare("SELECT c.* FROM team_comments c JOIN team_tasks t ON t.id=c.task_id WHERE t.workspace_id=? AND (? IN ('owner','manager') OR t.assignee_user_id=?) ORDER BY c.created_at").all(wid,member.role,userId);
  res.json({workspace:db.prepare("SELECT * FROM team_workspaces WHERE id=?").get(wid),membership:member,goals,tasks,members,activity,comments});
});
router.post("/invites",requireManager,(req,res,next)=>{
  try {
    const input=z.object({email:z.string().trim().email().max(254),role:z.enum(["manager","member"])}).strict().parse(req.body);
    const member=res.locals.teamMember as Member, userId=session(res).user_id, email=input.email.toLowerCase();
    if(db.prepare("SELECT 1 FROM team_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND lower(u.email)=?").get(member.workspace_id,email))
      return res.status(409).json({error:"This person is already a team member."});
    db.prepare("DELETE FROM team_invites WHERE expires_at<=? OR accepted_at IS NOT NULL").run(Date.now());
    const inviteToken=token(), expires=Date.now()+7*24*60*60*1000, inviteId=id();
    db.prepare("INSERT INTO team_invites(id,workspace_id,email,role,token_hash,invited_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(inviteId,member.workspace_id,email,input.role,hash(inviteToken),userId,expires,now());
    log(member,userId,"invited","member",inviteId,"Invited "+email+" as "+input.role);
    res.status(201).json({id:inviteId,email,role:input.role,token:inviteToken,expires_at:new Date(expires).toISOString(),join_path:"/join?token="+inviteToken});
  } catch(e){next(e);}
});
router.post("/goals",requireManager,(req,res,next)=>{
  try{
    const input=z.object({title:z.string().trim().min(1).max(200),description:z.string().max(4000).default(""),target:z.number().positive().max(1e9),current:z.number().min(0).max(1e9).default(0),unit:z.string().max(40).default("deliverables"),due_date:z.string().date().nullable().default(null),owner_user_id:z.string().uuid().nullable().default(null)}).strict().parse(req.body);
    const m=res.locals.teamMember as Member, uid=session(res).user_id, stamp=now(), gid=id();
    if(input.owner_user_id&&!db.prepare("SELECT 1 FROM team_members WHERE workspace_id=? AND user_id=? AND status='active'").get(m.workspace_id,input.owner_user_id)) return res.status(400).json({error:"Goal owner must be an active team member."});
    db.prepare("INSERT INTO team_goals(id,workspace_id,title,description,target,current,unit,due_date,owner_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(gid,m.workspace_id,input.title,input.description,input.target,input.current,input.unit,input.due_date,input.owner_user_id,uid,stamp,stamp);
    log(m,uid,"created","goal",gid,input.title);
    res.status(201).json(db.prepare("SELECT * FROM team_goals WHERE id=?").get(gid));
  }catch(e){next(e);}
});
router.patch("/goals/:id",requireManager,(req,res,next)=>{
  try{
    const input=z.object({title:z.string().trim().min(1).max(200).optional(),description:z.string().max(4000).optional(),target:z.number().positive().max(1e9).optional(),current:z.number().min(0).max(1e9).optional(),unit:z.string().max(40).optional(),due_date:z.string().date().nullable().optional(),owner_user_id:z.string().uuid().nullable().optional()}).strict().parse(req.body);
    const m=res.locals.teamMember as Member;
    if(!db.prepare("SELECT id FROM team_goals WHERE id=? AND workspace_id=?").get(req.params.id,m.workspace_id))return res.status(404).json({error:"Goal not found."});
    const keys=Object.keys(input);if(keys.length)db.prepare("UPDATE team_goals SET "+keys.map(k=>k+"=?").join(",")+",updated_at=? WHERE id=? AND workspace_id=?").run(...keys.map(k=>(input as Record<string,unknown>)[k]),now(),req.params.id,m.workspace_id);
    log(m,session(res).user_id,"updated","goal",req.params.id,"Updated team goal");
    res.json(db.prepare("SELECT * FROM team_goals WHERE id=?").get(req.params.id));
  }catch(e){next(e);}
});
router.post("/tasks",requireManager,(req,res,next)=>{
  try{
    const input=z.object({title:z.string().trim().min(1).max(200),description:z.string().max(5000).default(""),assignee_user_id:z.string().uuid(),goal_id:z.string().uuid().nullable().default(null),priority:z.enum(["low","medium","high"]).default("medium"),due_date:z.string().date().nullable().default(null),deliverable:z.string().max(2000).default(""),reviewer_user_id:z.string().uuid().nullable().default(null)}).strict().parse(req.body);
    const m=res.locals.teamMember as Member,uid=session(res).user_id,stamp=now(),tid=id();
    for(const person of [input.assignee_user_id,input.reviewer_user_id].filter(Boolean)) if(!db.prepare("SELECT 1 FROM team_members WHERE workspace_id=? AND user_id=? AND status='active'").get(m.workspace_id,person))return res.status(400).json({error:"Assignee and reviewer must be active team members."});
    if(input.goal_id&&!db.prepare("SELECT 1 FROM team_goals WHERE id=? AND workspace_id=?").get(input.goal_id,m.workspace_id))return res.status(400).json({error:"Selected team goal is unavailable."});
    db.prepare("INSERT INTO team_tasks(id,workspace_id,title,description,assignee_user_id,goal_id,priority,due_date,deliverable,reviewer_user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(tid,m.workspace_id,input.title,input.description,input.assignee_user_id,input.goal_id,input.priority,input.due_date,input.deliverable,input.reviewer_user_id||uid,uid,stamp,stamp);
    log(m,uid,"assigned","task",tid,input.title);
    res.status(201).json(db.prepare("SELECT * FROM team_tasks WHERE id=?").get(tid));
  }catch(e){next(e);}
});
router.patch("/tasks/:id/status",(req,res,next)=>{
  try{
    const input=z.object({status:z.enum(["in_progress","submitted","revision_requested","approved","completed"]),feedback:z.string().max(4000).optional()}).strict().parse(req.body);
    const m=res.locals.teamMember as Member,uid=session(res).user_id;
    const task=db.prepare("SELECT * FROM team_tasks WHERE id=? AND workspace_id=?").get(req.params.id,m.workspace_id) as {assignee_user_id:string;reviewer_user_id:string|null;status:string;title:string}|undefined;
    if(!task)return res.status(404).json({error:"Task not found."});
    const memberAction=["in_progress","submitted"].includes(input.status);
    if(memberAction&&task.assignee_user_id!==uid)return res.status(403).json({error:"You can only update tasks assigned to you."});
    if(!memberAction&&!["owner","manager"].includes(m.role))return res.status(403).json({error:"Only the owner or manager can review submitted work."});
    if(!memberAction&&task.reviewer_user_id&&task.reviewer_user_id!==uid&&m.role!=="owner")return res.status(403).json({error:"This task is assigned to another reviewer."});
    if(input.status==="submitted"&&task.status!=="in_progress"&&task.status!=="revision_requested")return res.status(409).json({error:"Move the task into progress before submitting it."});
    if(["approved","revision_requested"].includes(input.status)&&task.status!=="submitted")return res.status(409).json({error:"Only submitted work can be reviewed."});
    const stamp=now();
    db.prepare("UPDATE team_tasks SET status=?,feedback=?,submitted_at=CASE WHEN ?='submitted' THEN ? ELSE submitted_at END,reviewed_at=CASE WHEN ? IN ('approved','revision_requested') THEN ? ELSE reviewed_at END,updated_at=? WHERE id=? AND workspace_id=?").run(input.status,input.feedback||"",input.status,stamp,input.status,stamp,stamp,req.params.id,m.workspace_id);
    log(m,uid,"changed_status","task",req.params.id,task.title+": "+input.status);
    res.json(db.prepare("SELECT * FROM team_tasks WHERE id=?").get(req.params.id));
  }catch(e){next(e);}
});
router.post("/tasks/:id/comments",(req,res,next)=>{
  try{
    const input=z.object({body:z.string().trim().min(1).max(4000)}).strict().parse(req.body);
    const m=res.locals.teamMember as Member,uid=session(res).user_id;
    const task=db.prepare("SELECT id,assignee_user_id FROM team_tasks WHERE id=? AND workspace_id=?").get(req.params.id,m.workspace_id) as {id:string;assignee_user_id:string}|undefined;
    if(!task)return res.status(404).json({error:"Task not found."});
    if(m.role==="member"&&task.assignee_user_id!==uid)return res.status(403).json({error:"You can only comment on your assigned tasks."});
    const cid=id(),stamp=now();db.prepare("INSERT INTO team_comments(id,task_id,user_id,body,created_at) VALUES (?,?,?,?,?)").run(cid,task.id,uid,input.body,stamp);
    log(m,uid,"commented","task",task.id,"Added task feedback");
    res.status(201).json({id:cid,task_id:task.id,user_id:uid,body:input.body,created_at:stamp});
  }catch(e){next(e);}
});
export default router;
