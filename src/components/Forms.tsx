import { useMemo, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { useApp } from "../lib/store";
import { getFormDefinition } from "../lib/formDefinitions";
import type { FormName } from "../types";
import { Button, Modal } from "./UI";

export default function Forms() {
  const { form, closeForm } = useApp();
  if (!form) return null;
  return (
    <FormDialog
      key={`${form.name}-${String(form.record?.id || "new")}`}
      name={form.name}
      record={form.record}
      defaults={form.defaults}
      onClose={closeForm}
    />
  );
}
function FormDialog({
  name,
  record,
  defaults,
  onClose,
}: {
  name: FormName;
  record?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  onClose: () => void;
}) {
  const { data, cycle, today, create, update, remove, rollover, toast } =
    useApp();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const definition = getFormDefinition({ data, cycle, today, record, name });
  const initialValues = useMemo(
    () => ({ ...definition.initial, ...(record || {}), ...(defaults || {}) }),
    [],
  ); // this dialog is keyed per record
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const setValue = (field: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      if (
        name === "content" &&
        [
          "title",
          "body",
          "ai_assisted",
          "session_id",
          "project_id",
          "asset_url",
        ].includes(field) &&
        prev[field] !== value
      )
        next.human_approved = 0;
      if (name === "sale" && field === "product_id" && !record) {
        const product = data.products.find((item) => item.id === value);
        if (product) next.amount = product.price;
      }
      return next;
    });
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {};
      for (const field of definition.fields) {
        const value = values[field.name];
        body[field.name] =
          field.type === "number" || field.name === "session_day"
            ? Number(value ?? 0)
            : field.type === "checkbox"
              ? name === "rollover"
                ? Boolean(value)
                : value
                  ? 1
                  : 0
              : String(value ?? "");
      }
      if (name === "rollover") {
        body.source_cycle_id = cycle.id;
        await rollover(body);
      } else if (record?.id && definition.resource)
        await update(definition.resource, String(record.id), body);
      else if (definition.resource) await create(definition.resource, body);
      toast(
        name === "rollover"
          ? "Your new cycle is ready."
          : record
            ? "Changes saved."
            : "Added to your workspace.",
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this record.");
    } finally {
      setBusy(false);
    }
  }
  async function deleteRecord() {
    if (
      !record?.id ||
      !definition.resource ||
      !window.confirm("Delete this record? This action cannot be undone.")
    )
      return;
    setBusy(true);
    setError("");
    try {
      await remove(definition.resource, String(record.id));
      toast("Record deleted.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        record
          ? definition.editTitle ||
            `Edit ${name === "session" ? "session" : name}`
          : definition.title
      }
      subtitle={definition.description}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="dialog-form">
        <div className="form-grid">
          {definition.fields.map((field) => (
            <label
              key={field.name}
              className={`${field.full ? "field-full" : ""} ${field.type === "checkbox" ? "checkbox-field" : ""}`}
            >
              {field.type === "checkbox" ? (
                <>
                  <input
                    type="checkbox"
                    checked={Boolean(values[field.name])}
                    onChange={(event) =>
                      setValue(field.name, event.target.checked)
                    }
                  />
                  <span>
                    {field.label}
                    {field.help && <small>{field.help}</small>}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {field.label}
                    {field.required && <i> *</i>}
                  </span>
                  {field.type === "select" ? (
                    <select
                      value={String(values[field.name] ?? "")}
                      onChange={(event) =>
                        setValue(field.name, event.target.value)
                      }
                      required={field.required}
                    >
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={String(values[field.name] ?? "")}
                      onChange={(event) =>
                        setValue(field.name, event.target.value)
                      }
                      placeholder={field.placeholder}
                      rows={3}
                      required={field.required}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={String(values[field.name] ?? "")}
                      onChange={(event) =>
                        setValue(field.name, event.target.value)
                      }
                      placeholder={field.placeholder}
                      required={field.required}
                      min={field.min}
                      max={field.max}
                      step={field.type === "number" ? "any" : undefined}
                    />
                  )}
                  {field.help && <small>{field.help}</small>}
                </>
              )}
            </label>
          ))}
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          {record?.id &&
          definition.resource &&
          !["cycles", "products"].includes(definition.resource) ? (
            <Button
              type="button"
              variant="danger"
              icon={Trash2}
              onClick={deleteRecord}
              disabled={busy}
            >
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy
                ? "Saving…"
                : definition.submit ||
                  (record ? "Save changes" : "Add to workspace")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
