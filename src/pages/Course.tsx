import { useState } from "react";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CircleDollarSign,
  MessageCircle,
  Megaphone,
  Plus,
  ShoppingBag,
  Target,
  TrendingUp,
  UsersRound,
} from "lucide-react";
import { asRecord, useApp } from "../lib/store";
import { displayDate, displayMonth } from "../lib/date";
import { currency, cycleMetrics, percentage } from "../lib/metrics";
import {
  Button,
  EmptyState,
  MetricCard,
  PageHeader,
  Pill,
  Progress,
  SectionHeading,
  Status,
  Tabs,
} from "../components/UI";

export default function Course() {
  const { data, cycle, today, openForm, setPage } = useApp();
  const [tab, setTab] = useState("sales");
  const metrics = cycleMetrics(data, cycle, today);
  const sales = data.sales
    .filter((item) => item.cycle_id === cycle.id)
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  const leads = data.leads.filter((item) => item.cycle_id === cycle.id);
  const campaigns = data.campaigns.filter((item) => item.cycle_id === cycle.id);
  const promotions = data.promotions
    .filter(
      (item) =>
        item.cycle_id === cycle.id ||
        (!item.cycle_id && item.promotion_date.startsWith(cycle.month)),
    )
    .sort((a, b) => b.promotion_date.localeCompare(a.promotion_date));
  const promotedToday = data.promotions.some(
    (item) => item.promotion_date === today && item.channel === "WhatsApp",
  );
  const primaryProduct =
    data.products.find((item) => item.active) || data.products[0];
  const converted = leads.filter((item) => item.status === "Converted").length;
  return (
    <div className="page-wrap">
      <PageHeader
        eyebrow="BUILD YOUR BUSINESS"
        title="Course Growth"
        description="Turn meaningful conversations into sustainable growth."
        actions={
          <>
            <Button icon={Plus} onClick={() => openForm("lead")}>
              Add enquiry
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => openForm("sale")}
            >
              Log a sale
            </Button>
          </>
        }
      />
      <div className="module-banner course-banner">
        <div>
          <div className="banner-kicker">
            <span /> YOUR OFFER · {displayMonth(cycle.month).toUpperCase()}
          </div>
          <h2>{primaryProduct?.name || "Your product"}</h2>
          <p>
            {primaryProduct
              ? `${currency(primaryProduct.price)} per sale · ${cycle.sales_target} paid sales target`
              : "Add a product to start tracking sales."}
          </p>
          <button
            onClick={() =>
              primaryProduct
                ? openForm("product", asRecord(primaryProduct))
                : openForm("product")
            }
          >
            {primaryProduct ? "Manage product" : "Add product"}{" "}
            <ArrowRight size={14} />
          </button>
        </div>
        <div className="banner-art">
          <div className="banner-art-ring ring-a" />
          <div className="banner-art-ring ring-b" />
          <span>
            <ShoppingBag size={27} />
          </span>
        </div>
      </div>
      <div className="metrics-grid module-metrics">
        <MetricCard
          icon={CircleDollarSign}
          label="Paid sales"
          value={
            <>
              {metrics.sales}
              <span> / {cycle.sales_target}</span>
            </>
          }
          detail={`${metrics.salesRemaining} more to reach your target`}
          progress={percentage(metrics.sales, cycle.sales_target)}
          iconTone="blue"
        />
        <MetricCard
          icon={TrendingUp}
          label="Realised revenue"
          value={currency(metrics.revenue)}
          detail={`${currency(metrics.revenueRemaining)} remaining`}
          progress={percentage(metrics.revenue, cycle.revenue_target)}
          iconTone="green"
        />
        <MetricCard
          icon={MessageCircle}
          label="Enquiries"
          value={leads.length}
          detail="Recorded this cycle"
          iconTone="purple"
        />
        <MetricCard
          icon={Target}
          label="Lead conversion"
          value={
            leads.length
              ? `${Math.round((converted / leads.length) * 100)}%`
              : "—"
          }
          detail={`${converted} converted enquiries`}
          iconTone="orange"
        />
      </div>
      <div className="module-layout">
        <section className="panel record-panel">
          <div className="record-panel-top">
            <SectionHeading
              title="Growth activity"
              sub={`Records for ${displayMonth(cycle.month)}.`}
            />
            <Tabs
              selected={tab}
              onChange={setTab}
              tabs={[
                { id: "sales", label: "Sales", count: sales.length },
                { id: "leads", label: "Enquiries", count: leads.length },
                {
                  id: "campaigns",
                  label: "Campaigns",
                  count: campaigns.length,
                },
                {
                  id: "promotions",
                  label: "Promotions",
                  count: promotions.length,
                },
              ]}
            />
          </div>
          {tab === "sales" &&
            (sales.length ? (
              <div className="record-list">
                {sales.map((sale) => (
                  <button
                    className="record-row"
                    key={sale.id}
                    onClick={() => openForm("sale", asRecord(sale))}
                  >
                    <span className="record-icon blue">
                      <BadgeDollarSign size={17} />
                    </span>
                    <span className="record-main">
                      <strong>{sale.buyer || "Unnamed customer"}</strong>
                      <small>
                        {data.products.find(
                          (item) => item.id === sale.product_id,
                        )?.name || "Product"}{" "}
                        · {sale.source} · {displayDate(sale.sale_date)}
                      </small>
                    </span>
                    <span className="record-meta">
                      <strong>{currency(sale.amount)}</strong>
                      <Status value={sale.status} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={CircleDollarSign}
                title="No sales recorded yet"
                text="Log a payment when it comes in. Pending and refunded records won’t count as paid sales."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("sale")}
                  >
                    Log your first sale
                  </Button>
                }
              />
            ))}
          {tab === "leads" &&
            (leads.length ? (
              <div className="record-list">
                {leads.map((lead) => (
                  <button
                    className="record-row"
                    key={lead.id}
                    onClick={() => openForm("lead", asRecord(lead))}
                  >
                    <span className="record-icon purple">
                      <MessageCircle size={17} />
                    </span>
                    <span className="record-main">
                      <strong>{lead.name}</strong>
                      <small>
                        {lead.source}
                        {lead.follow_up_date
                          ? ` · Follow up ${displayDate(lead.follow_up_date)}`
                          : " · No follow-up date"}
                      </small>
                    </span>
                    <Status value={lead.status} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={MessageCircle}
                title="No enquiries yet"
                text="Add interested people and keep track of the next conversation."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("lead")}
                  >
                    Add an enquiry
                  </Button>
                }
              />
            ))}
          {tab === "campaigns" &&
            (campaigns.length ? (
              <div className="record-list">
                {campaigns.map((item) => (
                  <button
                    className="record-row"
                    key={item.id}
                    onClick={() => openForm("campaign", asRecord(item))}
                  >
                    <span className="record-icon orange">
                      <Megaphone size={17} />
                    </span>
                    <span className="record-main">
                      <strong>{item.name}</strong>
                      <small>
                        {item.channel}{" "}
                        {item.start_date && `· ${displayDate(item.start_date)}`}
                      </small>
                    </span>
                    <Status value={item.status} />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Megaphone}
                title="Make room for a campaign"
                text="Keep your course promotions and their results in one place."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("campaign")}
                  >
                    Add campaign
                  </Button>
                }
              />
            ))}
          {tab === "promotions" &&
            (promotions.length ? (
              <div className="record-list">
                {promotions.map((item) => (
                  <button
                    className="record-row"
                    key={item.id}
                    onClick={() => openForm("promotion", asRecord(item))}
                  >
                    <span className="record-icon green">
                      <Megaphone size={17} />
                    </span>
                    <span className="record-main">
                      <strong>{item.channel} promotion</strong>
                      <small>
                        {item.notes || "Promotion recorded"} ·{" "}
                        {displayDate(item.promotion_date)}
                      </small>
                    </span>
                    <Pill tone="green" dot>
                      Shared
                    </Pill>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Megaphone}
                title="No promotions logged"
                text="Record the promotions you actually shared. Nothing is sent automatically."
                action={
                  <Button
                    variant="ghost"
                    icon={Plus}
                    onClick={() => openForm("promotion")}
                  >
                    Log promotion
                  </Button>
                }
              />
            ))}
        </section>
        <aside className="module-aside">
          <section className="panel side-panel">
            <div className="side-panel-icon green">
              <MessageCircle size={18} />
            </div>
            <span className="overline">DAILY RHYTHM</span>
            <h2>WhatsApp promotion</h2>
            <p>A small, useful share can start a conversation.</p>
            <div className="rhythm-status">
              <span className={`rhythm-dot ${promotedToday ? "done" : ""}`} />
              <span>
                <strong>
                  {promotedToday ? "Logged for today" : "Not logged today"}
                </strong>
                <small>
                  {displayDate(today, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </small>
              </span>
            </div>
            <Button
              className="wide"
              icon={Plus}
              onClick={() => openForm("promotion")}
            >
              {promotedToday ? "Log another promotion" : "Log a promotion"}
            </Button>
          </section>
          <section className="panel side-panel compact-side">
            <SectionHeading
              title="The monthly target"
              action={<Target size={17} className="muted-icon" />}
            />
            <div className="side-target">
              <span>Paid sales</span>
              <strong>
                {metrics.sales} / {cycle.sales_target}
              </strong>
            </div>
            <Progress value={percentage(metrics.sales, cycle.sales_target)} />
            <div className="side-target">
              <span>Revenue</span>
              <strong>
                {currency(metrics.revenue)} / {currency(cycle.revenue_target)}
              </strong>
            </div>
            <Progress
              value={percentage(metrics.revenue, cycle.revenue_target)}
              color="green"
            />
            <button
              className="side-link"
              onClick={() => openForm("cycle", asRecord(cycle))}
            >
              Edit cycle targets <ArrowRight size={14} />
            </button>
          </section>
          <section className="side-note">
            <CalendarClock size={17} />
            <span>
              <strong>Thoughtful follow-ups</strong>
              <small>
                {
                  leads.filter(
                    (item) =>
                      item.follow_up_date &&
                      item.follow_up_date <= today &&
                      !["Converted", "Not interested"].includes(item.status),
                  ).length
                }{" "}
                enquiries need attention today or earlier.
              </small>
            </span>
            <button onClick={() => setTab("leads")} aria-label="View enquiries">
              <ArrowRight size={15} />
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
