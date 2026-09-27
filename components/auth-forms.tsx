"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Sprout } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiRequestError, Notice } from "@/components/ui";
import { RegionalSettingsFields } from "@/components/regional-settings-fields";
import { EMPTY_REGIONAL_SETTINGS, regionalSettingsSchema } from "@/lib/regional-settings";

function PasswordField({ name, label, autoComplete = "current-password" }: { name: string; label: string; autoComplete?: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{label}</span><div className="password-wrap"><input name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} required /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>;
}

export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await apiRequest<{ redirectTo: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identity: data.get("identity"), password: data.get("password") }) });
      router.replace(result.redirectTo); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed."); setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit}>
    <div className="auth-title"><span className="eyebrow">STAFF ACCESS</span><h1>Welcome back<br />to the tea room.</h1><p>Sign in to continue to today&apos;s ledger.</p></div>
    {error ? <Notice message={error} tone="error" /> : null}
    <label className="field"><span>Username or email</span><input name="identity" autoComplete="username" placeholder="e.g. mei.lin" required autoFocus /></label>
    <PasswordField name="password" label="Password" />
    <button className="button button-primary button-large" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={17} />}{busy ? "Signing in…" : "Open the ledger"}<ArrowRight size={17} /></button>
    <p className="setup-link">New workspace? <Link href="/setup">Create the first Owner account</Link></p>
  </form>;
}

export function SetupForm() {
  const router = useRouter();
  const [regional, setRegional] = useState(EMPTY_REGIONAL_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  useEffect(() => {
    apiRequest<{ configured: boolean }>("/api/setup")
      .then((result) => {
        setConfigured(result.configured);
        if (result.configured) setError("This workspace already has an Owner. Return to sign in.");
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not check workspace setup."))
      .finally(() => setChecking(false));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setError(""); setFieldErrors({});
    const regionalCheck = regionalSettingsSchema.safeParse(regional);
    if (!regionalCheck.success) {
      const issues = regionalCheck.error.flatten().fieldErrors as Record<string, string[]>;
      setFieldErrors(issues);
      setError("Review the highlighted country, currency and regional settings.");
      const first = Object.keys(issues)[0] === "acceptedCurrencies" ? "currency" : Object.keys(issues)[0];
      requestAnimationFrame(() => form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
      return;
    }
    setBusy(true);
    const data = new FormData(form);
    try {
      const result = await apiRequest<{ redirectTo: string }>("/api/setup", { method: "POST", body: JSON.stringify({
        ...regional,
        businessName: data.get("businessName"), fullName: data.get("fullName"), username: data.get("username"),
        email: data.get("email"), password: data.get("password"), seedProducts: data.get("seedProducts") === "on",
        platformTermsAccepted: data.get("platformTermsAccepted") === "on",
        platformPrivacyAccepted: data.get("platformPrivacyAccepted") === "on",
      }) });
      router.replace(result.redirectTo); router.refresh();
    } catch (reason) { if (reason instanceof ApiRequestError && reason.issues) setFieldErrors(reason.issues); setError(reason instanceof Error ? reason.message : "Setup failed."); setBusy(false); }
  }
  return <form className="auth-form setup-form" onSubmit={submit}>
    <div className="auth-title"><span className="eyebrow">FIRST POUR</span><h1>Set up your<br />matchā ledger.</h1><p>This creates the only Owner account. The Owner can invite every other role later.</p></div>
    {error ? <Notice message={error} tone="error" /> : null}
    <div className="form-grid two"><label className="field"><span>Business name</span><input name="businessName" defaultValue="Kōn-Kōn Matchā" required /></label><label className="field"><span>Owner&apos;s full name</span><input name="fullName" autoComplete="name" required /></label></div>
    <div className="form-grid two"><label className="field"><span>Username</span><input name="username" autoComplete="username" pattern="[A-Za-z0-9._-]+" required /></label><label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label></div>
    <PasswordField name="password" label="Owner password · 12+ characters, mixed case and a number" autoComplete="new-password" />
    <RegionalSettingsFields value={regional} onChange={next => { setRegional(next); setFieldErrors({}); }} errors={fieldErrors} />
    <label className="check-row"><input name="seedProducts" type="checkbox" /><span><strong>Add sample Kōn-Kōn products</strong><small>Optional demo prices are examples in your chosen currency, not converted market prices. Review costs and opening stock before trading.</small></span></label>
    <label className="check-row"><input type="checkbox" required /><span>I have reviewed the accounting currency, local time zone and tax settings.</span></label>
    <label className="check-row"><input name="platformTermsAccepted" type="checkbox" required /><span><strong>I accept the <Link href="/terms" target="_blank">platform use terms</Link>.</strong><small>Managed supervision is optional after setup and always requires a separate Owner application.</small></span></label>
    <label className="check-row"><input name="platformPrivacyAccepted" type="checkbox" required /><span><strong>I acknowledge the privacy and managed-instance disclosure.</strong><small>The workspace keeps business data private. If I later apply for supervision, only disclosed deployment metadata is sent.</small></span></label>
    <button className="button button-primary button-large" disabled={busy || checking || configured}>{busy || checking ? <LoaderCircle className="spin" size={18} /> : <Sprout size={18} />}{checking ? "Checking workspace…" : busy ? "Preparing workspace…" : "Create Owner workspace"}<ArrowRight size={17} /></button>
    <p className="setup-link">Already set up? <Link href="/login">Return to sign in</Link></p>
  </form>;
}
