import assert from "node:assert/strict";
import test from "node:test";
import { ObjectId } from "mongodb";
import {
  calculateOnlineOffer,
  commerceSettingsSchema,
  createOrderAccessToken,
  onlineOrderRequestSchema,
  normaliseCommerceSettings,
  parseOrderAccessToken,
  storefrontProductIdSchema,
  validOrderAccess,
  orderAccessHash,
} from "../lib/online-orders";
import { resolvePublicOrigin } from "../lib/public-origin";

test("storefront product pages accept only canonical product identifiers", () => {
  assert.equal(storefrontProductIdSchema.safeParse(new ObjectId().toHexString()).success, true);
  assert.equal(storefrontProductIdSchema.safeParse("../hidden-product").success, false);
  assert.equal(storefrontProductIdSchema.safeParse("").success, false);
});

test("online-order access tokens are purpose hashed and reject tampering", () => {
  const id = new ObjectId();
  const token = createOrderAccessToken(id);
  assert.equal(parseOrderAccessToken(token)?.id, id.toHexString());
  assert.equal(validOrderAccess(orderAccessHash(token), token), true);
  assert.equal(validOrderAccess(orderAccessHash(token), `${token}x`), false);
  assert.equal(parseOrderAccessToken("KKO1-invalid-token"), null);
});

test("public order requests reject duplicate products and unexpected fields", () => {
  const productId = new ObjectId().toHexString();
  const base = {
    customerName: "Customer Name",
    email: "buyer@example.com",
    phone: "+60 12-345 6789",
    address: "12 Example Street, Kuala Lumpur",
    note: "",
    website: "",
    sensitiveAnswers: [],
  };
  assert.equal(
    onlineOrderRequestSchema.safeParse({
      ...base,
      items: [{ productId, quantity: 1 }],
    }).success,
    true,
  );
  assert.equal(
    onlineOrderRequestSchema.safeParse({
      ...base,
      items: [
        { productId, quantity: 1 },
        { productId, quantity: 2 },
      ],
    }).success,
    false,
  );
  assert.equal(
    onlineOrderRequestSchema.safeParse({
      ...base,
      items: [{ productId, quantity: 1 }],
      privileged: true,
    }).success,
    false,
  );
});

test("online offers apply counter-style discounts using currency precision", () => {
  const id = new ObjectId();
  const offer = calculateOnlineOffer(
    [
      {
        productId: id,
        sku: "TEA-01",
        name: "Test product",
        unit: "unit",
        quantity: 2,
        listPrice: 19.99,
      },
    ],
    [{ productId: id.toHexString(), quantity: 3, discountPercent: 12.5 }],
    "MYR",
  );
  assert.equal(offer.subtotal, 59.97);
  assert.equal(offer.discount, 7.5);
  assert.equal(offer.total, 52.47);
  assert.throws(
    () => calculateOnlineOffer([], [{ productId: id.toHexString(), quantity: 1, discountPercent: 0 }], "MYR"),
    /every requested product/i,
  );
});

test("controlled-goods question keys must be unique", () => {
  const common = {
    enabled: true,
    storeTitle: "Online order desk",
    storeSubtitle: "Choose products and send an order request.",
    termsNotice: "Submitting this request does not reserve stock or create a charge.",
    abandonedRetentionDays: 90,
  };
  assert.equal(
    commerceSettingsSchema.safeParse({
      ...common,
      sensitiveFields: [
        { key: "intended-use", label: "Intended use", required: true },
        { key: "intended-use", label: "Second use", required: false },
      ],
    }).success,
    false,
  );
});

test("saved commerce settings survive MongoDB metadata fields", () => {
  const settings = normaliseCommerceSettings({
    _id: new ObjectId(),
    key: "commerce",
    enabled: false,
    storeTitle: "Wholesale request desk",
    storeSubtitle: "Request reviewed products for a confirmed wholesale offer.",
    termsNotice: "This request remains subject to stock and commercial review.",
    sensitiveFields: [],
    abandonedRetentionDays: 60,
    updatedAt: new Date(),
  });
  assert.equal(settings.enabled, false);
  assert.equal(settings.storeTitle, "Wholesale request desk");
  assert.equal(settings.abandonedRetentionDays, 60);
  assert.equal(settings.completedRetentionEnabled, true);
  assert.equal(settings.completedRetentionDays, 90);
  assert.equal(settings.retentionReminderDays, 7);
});

test("commerce retention and public-domain settings are validated together", () => {
  const common = {
    enabled: true,
    storeTitle: "Online order desk",
    storeSubtitle: "Choose products and send an order request.",
    termsNotice: "Submitting this request does not reserve stock or create a charge.",
    sensitiveFields: [],
    abandonedRetentionDays: 90,
    completedRetentionEnabled: true,
    completedRetentionDays: 30,
  };
  assert.equal(commerceSettingsSchema.safeParse({ ...common, publicSiteUrl: "https://shop.example.com", retentionReminderDays: 7 }).success, true);
  assert.equal(commerceSettingsSchema.safeParse({ ...common, publicSiteUrl: "http://shop.example.com", retentionReminderDays: 7 }).success, false);
  assert.equal(commerceSettingsSchema.safeParse({ ...common, publicSiteUrl: "https://shop.example.com", retentionReminderDays: 30 }).success, false);
});

test("public links prefer the owner domain and otherwise follow the active deployment", () => {
  assert.equal(resolvePublicOrigin("https://preview.example.dev/api/storefront", "https://orders.example.com/path"), "https://orders.example.com");
  assert.equal(resolvePublicOrigin("https://new-deployment.example.dev/api/storefront"), "https://new-deployment.example.dev");
  assert.equal(resolvePublicOrigin("not a URL"), "");
});
