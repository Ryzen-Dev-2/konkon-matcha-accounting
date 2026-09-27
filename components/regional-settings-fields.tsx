"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";
import { COUNTRY_PROFILES, CURRENCY_OPTIONS, countryProfile, isValidCurrency, isValidLocale, isValidTimeZone } from "@/lib/international";
import { chooseRegionalCountry, type RegionalSettings } from "@/lib/regional-settings";

export function RegionalSettingsFields({ value, onChange, currencyLocked = false, errors = {} }: {
  value: RegionalSettings; onChange: (next: RegionalSettings) => void; currencyLocked?: boolean; errors?: Record<string, string[]>;
}) {
  const [search, setSearch] = useState("");
  const profile = countryProfile(value.countryCode);
  const patch = (fields: Partial<RegionalSettings>) => onChange({ ...value, ...fields });
  const currencies = [...new Set([...CURRENCY_OPTIONS, value.currency, ...value.acceptedCurrencies])].filter(Boolean).sort();
  const locale = isValidLocale(value.locale) ? value.locale : "en";
  const timeZone = isValidTimeZone(value.timeZone) ? value.timeZone : "UTC";
  const example = isValidCurrency(value.currency) ? new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(1234.5) : "Select a currency";
  const exampleDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date("2026-09-12T12:00:00Z"));

  return <section className="regional-settings">
    <header className="settings-section-title"><Globe2 /><div><h2>Main country & regional settings</h2><p>Choose your operating country. Review the suggested format and local time zone.</p></div></header>
    <div className="form-grid two">
      <label className="field"><span>Find a country or region</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or country code" /></label>
      <label className={`field ${errors.countryCode?.length ? "field-invalid" : ""}`}><span>Main country / region</span><select name="countryCode" value={value.countryCode} onChange={event => onChange(chooseRegionalCountry(value, event.target.value, currencyLocked))} required><option value="" disabled>Choose a country or region</option>{COUNTRY_PROFILES.filter(country => country.code === value.countryCode || `${country.name} ${country.code}`.toLowerCase().includes(search.trim().toLowerCase())).map(country => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select>{errors.countryCode?.[0] ? <small className="field-error" role="alert">{errors.countryCode[0]}</small> : null}</label>
    </div>
    <div className="form-grid two">
      <label className="field"><span>Business time zone</span><input name="timeZone" list="regional-time-zones" value={value.timeZone} onChange={event => patch({ timeZone: event.target.value })} required /><datalist id="regional-time-zones">{[...new Set([profile.timeZone, ...profile.timeZones, "UTC"])].map(zone => <option key={zone} value={zone} />)}</datalist><small>Suggestions are editable. Countries can have more than one time zone.</small></label>
      <label className="field"><span>Date & number format</span><input name="locale" value={value.locale} onChange={event => patch({ locale: event.target.value })} required /><small>A locale such as en-MY, de-DE or zh-CN; this does not translate the interface.</small></label>
    </div>
    <label className={`field ${errors.currency?.length || errors.acceptedCurrencies?.length ? "field-invalid" : ""}`}><span>Base accounting currency</span><select name={currencyLocked ? undefined : "currency"} value={value.currency} disabled={currencyLocked} onChange={event => patch({ currency: event.target.value, acceptedCurrencies: [...new Set([event.target.value, ...value.acceptedCurrencies])] })} required><option value="" disabled>Choose a currency</option>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select>{errors.currency?.[0] || errors.acceptedCurrencies?.[0] ? <small className="field-error" role="alert">{errors.currency?.[0] || errors.acceptedCurrencies?.[0]}</small> : currencyLocked ? <><input type="hidden" name="currency" value={value.currency} /><small>Fixed for this ledger to protect historical amounts. Changing the main country does not convert your books. Add other payment currencies below.</small></> : <small>Choose carefully: this is the unit of account for inventory, journals and reports. It is fixed after setup.</small>}</label>
    <div className="regional-preview" aria-live="polite"><strong>{profile.name}</strong><span>{example}</span><span>{exampleDate}</span><small>{timeZone} · Preview only</small></div>
    <div className="field"><span>Accepted settlement currencies</span><div className="regional-currencies">{value.acceptedCurrencies.map(currency => <span key={currency}><input type="hidden" name="acceptedCurrencies" value={currency} />{currency}{currency === value.currency ? <small>Base</small> : <button type="button" aria-label={`Remove ${currency}`} onClick={() => patch({ acceptedCurrencies: value.acceptedCurrencies.filter(code => code !== currency) })}>×</button>}</span>)}</div><label><span className="sr-only">Add a settlement currency</span><select value="" disabled={value.acceptedCurrencies.length >= 16} onChange={event => patch({ acceptedCurrencies: [...value.acceptedCurrencies, event.target.value] })}><option value="">Add a settlement currency…</option>{currencies.filter(currency => !value.acceptedCurrencies.includes(currency)).map(currency => <option key={currency}>{currency}</option>)}</select></label><small>Up to 16 currencies. Foreign-currency payments also require a configured exchange rate and payment method.</small></div>
    <div className="form-grid three">
      <label className="field"><span>Tax label</span><input name="taxName" value={value.taxName} onChange={event => patch({ taxName: event.target.value })} required /></label>
      <label className="field"><span>Tax rate %</span><input name="taxRate" type="number" min="0" max="100" step="0.01" value={value.taxRate} onChange={event => patch({ taxRate: Number(event.target.value) })} required /></label>
      <label className="field"><span>Retail price tax</span><select name="taxMode" value={value.taxMode} onChange={event => patch({ taxMode: event.target.value as RegionalSettings["taxMode"] })}><option value="EXCLUSIVE">Add tax at checkout</option><option value="INCLUSIVE">Tax included in price</option></select></label>
    </div>
    <p className="regional-note">Changing country resets the tax rate to 0% for review. Set your applicable rate and pricing mode before saving. This configures management reports, not a certified country tax-filing pack.</p>
  </section>;
}
