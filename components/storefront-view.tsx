"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  MessageCircle,
  Minus,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  ZoomIn,
  X,
} from "lucide-react";
import styles from "./storefront.module.css";
import { OFFICIAL_REPORT_URL } from "@/lib/platform-public";

type Product = {
  _id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  available: number;
  onlineDescription: string;
  onlineImage: string;
  sensitiveGood: boolean;
};

type StoreData = {
  business: {
    name: string;
    email: string;
    phone: string;
    currency: string;
    locale: string;
    logoDataUrl: string;
  };
  store: {
    enabled: boolean;
    storeTitle: string;
    storeSubtitle: string;
    termsNotice: string;
    sensitiveFields: Array<{ key: string; label: string; required: boolean }>;
  };
  products: Product[];
};

async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await response.json().catch(() => null)) as {
    ok: boolean;
    data?: T;
    error?: string;
  } | null;
  if (!response.ok || !body?.ok)
    throw new Error(body?.error || "The store could not complete this request.");
  return body.data as T;
}

export function StorefrontView({ productId = "" }: { productId?: string }) {
  const heroVideo = useRef<HTMLVideoElement>(null);
  const [data, setData] = useState<StoreData | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [sort, setSort] = useState("FEATURED");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ orderNo: string; message: string } | null>(null);
  const [preview, setPreview] = useState<Product | null>(null);
  const [reportHref, setReportHref] = useState(OFFICIAL_REPORT_URL);

  useEffect(() => {
    setReportHref(`${OFFICIAL_REPORT_URL}?instance=${encodeURIComponent(window.location.origin)}`);
  }, []);

  useEffect(() => {
    const endpoint = productId
      ? `/api/storefront?product=${encodeURIComponent(productId)}`
      : "/api/storefront";
    void api<StoreData>(endpoint)
      .then(setData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Store unavailable."));
  }, [productId]);

  useEffect(() => {
    const product = productId ? data?.products[0] : null;
    if (product) document.title = `${product.name} · ${data?.business.name || "Online shop"}`;
  }, [data, productId]);

  useEffect(() => {
    const video = heroVideo.current;
    if (!video) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      video.pause();
      return;
    }
    let visible = true;
    const syncPlayback = () => {
      if (!visible || document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    const observer = typeof window.IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          visible = Boolean(entry?.isIntersecting);
          syncPlayback();
        }, { threshold: 0.05 })
      : null;
    video.playbackRate = 1;
    observer?.observe(video);
    syncPlayback();
    document.addEventListener("visibilitychange", syncPlayback);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }, [productId]);

  useEffect(() => {
    if (!checkout && !preview && !success) return;
    const previous = document.body.style.overflow;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCheckout(false);
      setPreview(null);
      setSuccess(null);
    };
    document.body.style.overflow = "hidden";
    addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      removeEventListener("keydown", close);
    };
  }, [checkout, preview, success]);

  const products = data?.products || [];
  const categories = ["ALL", ...new Set(products.map((product) => product.category))];
  const visible = useMemo(() => {
    const filtered = products.filter(
      (product) =>
        (category === "ALL" || product.category === category) &&
        (!inStockOnly || product.available > 0) &&
        `${product.name} ${product.sku} ${product.category}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
    return [...filtered].sort((left, right) => {
      if (sort === "PRICE_ASC") return left.price - right.price;
      if (sort === "PRICE_DESC") return right.price - left.price;
      if (sort === "NAME") return left.name.localeCompare(right.name);
      return Number(right.available > 0) - Number(left.available > 0);
    });
  }, [category, inStockOnly, products, search, sort]);
  const selected = useMemo(
    () =>
      products
        .filter((product) => cart[product._id])
        .map((product) => ({ ...product, quantity: cart[product._id] })),
    [cart, products],
  );
  const quantity = selected.reduce((sum, item) => sum + item.quantity, 0);
  const money = new Intl.NumberFormat(data?.business.locale || "en", {
    style: "currency",
    currency: data?.business.currency || "USD",
  });
  const total = selected.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const hasSensitive = selected.some((item) => item.sensitiveGood);
  const featuredProduct = productId ? products[0] : null;
  const paused = data?.store.enabled === false;

  function change(product: Product, amount: number) {
    if (!data?.store.enabled) return;
    setCart((current) => {
      const next = Math.max(
        0,
        Math.min(product.available, Number(current[product._id] || 0) + amount),
      );
      const updated = { ...current, [product._id]: next };
      if (!next) delete updated[product._id];
      return updated;
    });
  }

  function openCheckout() {
    if (!quantity || paused) return;
    setError("");
    setCheckout(true);
  }

  function requestProduct(product: Product) {
    if (!product.available || paused) return;
    if (!cart[product._id]) change(product, 1);
    setError("");
    setCheckout(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.store.enabled || !selected.length) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ orderNo: string; message: string }>(
        "/api/storefront",
        {
          method: "POST",
          body: JSON.stringify({
            customerName: form.get("customerName"),
            email: form.get("email"),
            phone: form.get("phone"),
            address: form.get("address"),
            note: form.get("note"),
            website: form.get("website"),
            items: selected.map((item) => ({
              productId: item._id,
              quantity: item.quantity,
            })),
            sensitiveAnswers: hasSensitive
              ? data.store.sensitiveFields.map((field) => ({
                  key: field.key,
                  value: form.get(`sensitive-${field.key}`),
                }))
              : [],
          }),
        },
      );
      setSuccess(result);
      setCart({});
      setCheckout(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.storePage}>
      <header className={styles.storeHeader}>
        <Link href="/" className={styles.wordmark}>
          <span>{data?.business.logoDataUrl ? <img src={data.business.logoDataUrl} alt={`${data.business.name} logo`} /> : "KK"}</span>
          <strong>{data?.business.name || "Order desk"}</strong>
        </Link>
        <nav>
          <Link href="/shop#catalogue">Catalogue</Link>
          <Link href="/shop#how-it-works">How it works</Link>
        </nav>
        <button
          className={styles.cartButton}
          onClick={openCheckout}
          disabled={!quantity || paused}
          aria-label={paused ? "Online orders are paused" : `Open cart with ${quantity} items`}
        >
          <ShoppingBag size={18} />
          <span>{quantity || (paused ? "Paused" : "Cart")}</span>
        </button>
      </header>

      {paused ? <div className={styles.storePaused}>Online requests are paused. You can still browse the catalogue.</div> : null}

      {productId ? (
        !data && !error ? (
          <div className={styles.productPageState}>Preparing this product…</div>
        ) : error && !data ? (
          <div className={styles.productPageState}>
            <PackageSearch />
            <h1>Product unavailable</h1>
            <p>{error}</p>
            <Link href="/shop"><ArrowLeft />Back to the catalogue</Link>
          </div>
        ) : featuredProduct ? (
          <section className={styles.productDetail}>
            <i className={styles.detailOrbOne} aria-hidden="true" />
            <i className={styles.detailOrbTwo} aria-hidden="true" />
            <Link className={styles.backToShop} href="/shop#catalogue"><ArrowLeft />All products</Link>
            <div className={styles.detailGrid}>
              <button
                type="button"
                className={`${styles.detailVisual} ${featuredProduct.onlineImage ? styles.detailHasImage : ""}`}
                onClick={() => featuredProduct.onlineImage && setPreview(featuredProduct)}
                disabled={!featuredProduct.onlineImage}
                aria-label={featuredProduct.onlineImage ? `Preview ${featuredProduct.name}` : `${featuredProduct.name} has no image`}
              >
                {featuredProduct.onlineImage ? (
                  <img src={featuredProduct.onlineImage} alt={featuredProduct.name} decoding="async" referrerPolicy="no-referrer" />
                ) : <PackageSearch />}
                <span>{featuredProduct.onlineImage ? <><ZoomIn />View full image</> : "Image coming soon"}</span>
              </button>
              <div className={styles.detailCopy}>
                <div className={styles.detailStatus}>
                  <span>{featuredProduct.available ? "Available now" : "Restocking"}</span>
                  {featuredProduct.sensitiveGood ? <b>Controlled item</b> : null}
                </div>
                <small>{featuredProduct.category} · {featuredProduct.sku}</small>
                <h1>{featuredProduct.name}</h1>
                <p>{featuredProduct.onlineDescription || `Sold per ${featuredProduct.unit}. Availability is confirmed before payment.`}</p>
                <div className={styles.detailPrice}>
                  <strong>{money.format(featuredProduct.price)}</strong>
                  <span>per {featuredProduct.unit}</span>
                  <small>{featuredProduct.available} currently available</small>
                </div>
                <div className={styles.detailPromise}>
                  <Sparkles />
                  <p><strong>Request first. Pay after confirmation.</strong> Staff verify stock, final pricing and delivery in your private order chat.</p>
                </div>
                <div className={styles.detailActions}>
                  {cart[featuredProduct._id] ? (
                    <div className={styles.quantityControl}>
                      <button aria-label={`Remove one ${featuredProduct.name}`} onClick={() => change(featuredProduct, -1)}><Minus size={16} /></button>
                      <b>{cart[featuredProduct._id]}</b>
                      <button aria-label={`Add one ${featuredProduct.name}`} onClick={() => change(featuredProduct, 1)} disabled={cart[featuredProduct._id] >= featuredProduct.available}><Plus size={16} /></button>
                    </div>
                  ) : null}
                  <button className={styles.detailRequest} onClick={() => requestProduct(featuredProduct)} disabled={!featuredProduct.available || paused}>
                    {paused ? "Orders paused" : featuredProduct.available ? "Request this item" : "Currently unavailable"}<ArrowRight />
                  </button>
                </div>
                <div className={styles.detailFacts}>
                  <span><ShieldCheck />No payment is taken now</span>
                  <span><ShoppingBag />Live stock is rechecked by staff</span>
                </div>
              </div>
            </div>
          </section>
        ) : null
      ) : <>
      <section className={styles.storeHero}>
        <div className={styles.storeMascotStage} aria-hidden="true">
          <div className={styles.storeMascotOrbit}><i /><i /><span /></div>
          <video ref={heroVideo} className={styles.storeHeroVideo} autoPlay muted loop playsInline preload="auto" poster="/media/mascot/kona-base-v1.png" disablePictureInPicture>
            <source src="/media/mascot/kona-hero-source.mp4" type="video/mp4" />
          </video>
          <span className={styles.storeMotionBadge}><i />KONA LIVE</span>
        </div>
        <div className={styles.storeHeroCopy}>
          <span className={styles.signal}>ONLINE ORDER REQUEST</span>
          <h1>{data?.store.storeTitle || "Choose. Request. Confirm."}</h1>
          <p>
            {data?.store.storeSubtitle ||
              "Browse live products and ask for a confirmed offer before payment."}
          </p>
        </div>
        <div className={styles.routeCard} aria-label="Order route">
          <span>01</span><strong>Select</strong><i />
          <span>02</span><strong>Request</strong><i />
          <span>03</span><strong>Chat</strong><i />
          <span>04</span><strong>Pay & track</strong>
        </div>
      </section>

      <section className={styles.commercePromise} id="how-it-works" aria-label="Order service promises">
        <article><ShieldCheck /><span><strong>Verified availability</strong><small>Staff recheck live stock before any payment.</small></span></article>
        <article><MessageCircle /><span><strong>Private order chat</strong><small>Confirm variations, delivery and documents in one place.</small></span></article>
        <article><Clock3 /><span><strong>Clear order trail</strong><small>Offers, invoices, receipts and tracking stay connected.</small></span></article>
      </section>

      <section className={styles.catalogue} id="catalogue">
        <header className={styles.catalogueHeader}>
          <div>
            <span className={styles.signal}>LIVE CATALOGUE</span>
            <h2>Available products</h2>
          </div>
          <div className={styles.catalogueTools}>
            <label className={styles.searchBox}>
              <Search size={18} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or SKU" />
            </label>
            <label className={styles.sortBox}><SlidersHorizontal size={15} /><select aria-label="Sort products" value={sort} onChange={(event) => setSort(event.target.value)}><option value="FEATURED">Featured</option><option value="PRICE_ASC">Price: low to high</option><option value="PRICE_DESC">Price: high to low</option><option value="NAME">Name</option></select></label>
          </div>
        </header>
        <div className={styles.catalogueNavigation}>
          <div className={styles.categoryRail}>
            {categories.map((item) => (
              <button key={item} className={category === item ? styles.activeCategory : ""} onClick={() => setCategory(item)}>
                {item === "ALL" ? "All products" : item}
              </button>
            ))}
          </div>
          <label className={styles.stockToggle}><input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} /><span>In stock only</span></label>
        </div>
        <div className={styles.catalogueSummary}><strong>{visible.length}</strong><span>product{visible.length === 1 ? "" : "s"} ready to browse</span><i /><small>Prices are estimates until staff confirmation</small></div>
        {!data && !error ? (
          <div className={styles.loading}>Loading catalogue…</div>
        ) : error && !data ? (
          <div className={styles.storeError}>{error}</div>
        ) : visible.length ? (
          <div className={styles.productGrid}>
            {visible.map((product, index) => {
              const count = cart[product._id] || 0;
              return (
                <article className={styles.productCard} key={product._id} style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}>
                  <div className={`${styles.productVisual} ${product.onlineImage ? styles.productHasImage : ""}`}>
                    <Link href={`/shop/${product._id}`} aria-label={`View ${product.name}`}>
                      {product.onlineImage ? <img src={product.onlineImage} alt={product.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <PackageSearch />}
                    </Link>
                    <span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={`${styles.cardStatus} ${product.available ? "" : styles.cardRestock}`}>{product.available ? "READY" : "RESTOCK"}</span>
                    {product.onlineImage ? <button type="button" className={styles.previewButton} onClick={() => setPreview(product)} aria-label={`Preview ${product.name}`}><ZoomIn /></button> : null}
                    {product.sensitiveGood ? <b>CONTROLLED</b> : null}
                  </div>
                  <div className={styles.productCopy}>
                    <small>{product.category} · {product.sku}</small>
                    <h3><Link href={`/shop/${product._id}`}>{product.name}</Link></h3>
                    <p>{product.onlineDescription || `Sold per ${product.unit}. Availability is confirmed before payment.`}</p>
                  </div>
                  <footer>
                    <div>
                      <strong>{money.format(product.price)}</strong>
                      <small>{product.available} {product.unit} available</small>
                    </div>
                    {count ? (
                      <div className={styles.quantityControl}>
                        <button aria-label={`Remove one ${product.name}`} onClick={() => change(product, -1)}><Minus size={15} /></button>
                        <b>{count}</b>
                        <button aria-label={`Add one ${product.name}`} onClick={() => change(product, 1)} disabled={count >= product.available}><Plus size={15} /></button>
                      </div>
                    ) : (
                      <button className={styles.addButton} onClick={() => change(product, 1)} disabled={!product.available || paused}>
                        {paused ? "Paused" : product.available ? "Add" : "Unavailable"}<Plus size={15} />
                      </button>
                    )}
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyProducts}>No products match this search.</div>
        )}
      </section>
      </>}

      {quantity ? (
        <button className={styles.floatingCart} onClick={openCheckout}>
          <span>{quantity} item{quantity === 1 ? "" : "s"}</span>
          <strong>{money.format(total)}</strong>
          <ArrowRight size={18} />
        </button>
      ) : null}

      {checkout ? (
        <div className={styles.sheetBackdrop} role="presentation">
          <section className={styles.checkoutSheet} role="dialog" aria-modal="true" aria-label="Order request">
            <header>
              <div><span className={styles.signal}>ORDER REQUEST</span><h2>Review your selection</h2></div>
              <button onClick={() => setCheckout(false)} aria-label="Close"><X /></button>
            </header>
            <div className={styles.selectedItems}>
              {selected.map((item) => (
                <article key={item._id}>
                  <div><strong>{item.name}</strong><small>{money.format(item.price)} / {item.unit}</small></div>
                  <div className={styles.quantityControl}><button onClick={() => change(item, -1)}><Minus size={14} /></button><b>{item.quantity}</b><button onClick={() => change(item, 1)} disabled={item.quantity >= item.available}><Plus size={14} /></button></div>
                  <strong>{money.format(item.price * item.quantity)}</strong>
                </article>
              ))}
              <footer><span>Estimated list price</span><strong>{money.format(total)}</strong></footer>
            </div>
            <form onSubmit={submit} className={styles.orderForm}>
              <input className={styles.honeypot} tabIndex={-1} autoComplete="off" name="website" />
              <div className={styles.formPair}>
                <label><span>Name</span><input name="customerName" required maxLength={120} /></label>
                <label><span>Email</span><input name="email" type="email" required maxLength={254} /></label>
              </div>
              <label><span>Phone number</span><input name="phone" type="tel" required maxLength={40} /></label>
              <label><span>Delivery address</span><textarea name="address" required minLength={8} maxLength={500} rows={3} /></label>
              {hasSensitive ? (
                <fieldset className={styles.sensitiveFields}>
                  <legend><ShieldCheck size={17} />Controlled-item details</legend>
                  <p>These answers help staff confirm any additional fulfilment steps.</p>
                  {data?.store.sensitiveFields.map((field) => (
                    <label key={field.key}><span>{field.label}</span><textarea name={`sensitive-${field.key}`} required={field.required} maxLength={500} rows={2} /></label>
                  ))}
                </fieldset>
              ) : null}
              <label><span>Message · optional</span><textarea name="note" maxLength={1000} rows={3} placeholder="Delivery timing, preferred variation or a question" /></label>
              <p className={styles.terms}><ShieldCheck size={17} />{data?.store.termsNotice}</p>
              {error ? <p className={styles.formError}>{error}</p> : null}
              <button className={styles.submitOrder} disabled={busy || !selected.length}>{busy ? "Sending request…" : "Send order request"}<ArrowRight size={17} /></button>
            </form>
          </section>
        </div>
      ) : null}

      {success ? (
        <div className={styles.sheetBackdrop} role="presentation">
          <section className={styles.successCard} role="dialog" aria-modal="true">
            <i><Check /></i>
            <span className={styles.signal}>REQUEST RECEIVED</span>
            <h2>{success.orderNo}</h2>
            <p>{success.message}</p>
            <button onClick={() => setSuccess(null)}>Continue browsing</button>
          </section>
        </div>
      ) : null}

      {preview ? <div className={styles.previewBackdrop} role="presentation" onClick={() => setPreview(null)}><section className={styles.imagePreview} role="dialog" aria-modal="true" aria-label={`${preview.name} image preview`} onClick={(event) => event.stopPropagation()}><button onClick={() => setPreview(null)} aria-label="Close image preview"><X /></button><img src={preview.onlineImage} alt={preview.name} referrerPolicy="no-referrer" /><footer><span>{preview.category} · {preview.sku}</span><strong>{preview.name}</strong><small>{money.format(preview.price)} / {preview.unit}</small></footer></section></div> : null}
      <a className={styles.trustReportLink} href={reportHref}>Report a managed-store concern</a>
    </main>
  );
}
