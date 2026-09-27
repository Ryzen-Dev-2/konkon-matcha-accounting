import { z } from "zod";

export const TEMPLATE_BLOCK_ALIGNMENTS = ["LEFT", "CENTER", "RIGHT"] as const;
export const TEMPLATE_BLOCK_WIDTHS = ["FULL", "TWO_THIRDS", "HALF", "THIRD"] as const;
export const TEMPLATE_BLOCK_SURFACES = ["PLAIN", "OUTLINE", "TINT", "ACCENT"] as const;
export const TEMPLATE_BLOCK_SPACING = ["COMPACT", "STANDARD", "RELAXED"] as const;

export const templateBlockStyleSchema = z.object({
  key: z.string().min(1).max(80),
  width: z.enum(TEMPLATE_BLOCK_WIDTHS).default("FULL"),
  surface: z.enum(TEMPLATE_BLOCK_SURFACES).default("PLAIN"),
  spacing: z.enum(TEMPLATE_BLOCK_SPACING).default("STANDARD"),
  alignment: z.enum(TEMPLATE_BLOCK_ALIGNMENTS).default("LEFT"),
});

export const templateCustomBlockSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{8,64}$/),
  kind: z.enum(["HEADING", "TEXT", "IMAGE", "CALLOUT", "QR", "SIGNATURE", "DIVIDER", "SPACER"]),
  label: z.string().trim().min(1).max(60),
  content: z.string().max(280_000),
  alignment: z.enum(TEMPLATE_BLOCK_ALIGNMENTS).default("LEFT"),
}).superRefine((block, context) => {
  if (["HEADING", "TEXT", "CALLOUT", "SIGNATURE"].includes(block.kind) && (!block.content.trim() || block.content.length > 1_000)) {
    context.addIssue({ code: "custom", path: ["content"], message: "Text components require 1–1,000 characters." });
  }
  if (block.kind === "SIGNATURE" && block.content.length > 120) {
    context.addIssue({ code: "custom", path: ["content"], message: "Signature labels must be 120 characters or fewer." });
  }
  if (block.kind === "IMAGE" && !/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(block.content)) {
    context.addIssue({ code: "custom", path: ["content"], message: "Image components must contain an uploaded PNG, JPEG or WebP." });
  }
  if (block.kind === "QR") {
    try {
      const url = new URL(block.content);
      if (url.protocol !== "https:") throw new Error("Unsupported protocol");
    } catch {
      context.addIssue({ code: "custom", path: ["content"], message: "QR components require a complete HTTPS link." });
    }
  }
});

export type TemplateCustomBlock = z.infer<typeof templateCustomBlockSchema>;
export type TemplateBlockStyle = z.infer<typeof templateBlockStyleSchema>;

export function customBlockKey(id: string) {
  return `CUSTOM:${id}`;
}

export function validateTemplateBlocks(
  order: string[],
  customBlocks: TemplateCustomBlock[],
  builtIns: readonly string[],
) {
  const expected = [...builtIns, ...customBlocks.map(block => customBlockKey(block.id))];
  const unique = new Set(order);
  if (unique.size !== order.length) return "Each document component can appear only once.";
  if (expected.some(key => !unique.has(key)) || order.some(key => !expected.includes(key))) {
    return "The document component order is incomplete.";
  }
  if (customBlocks.reduce((total, block) => total + block.content.length, 0) > 300_000) {
    return "Custom component content is too large. Keep the combined total under 300 KB.";
  }
  return null;
}

export function validateTemplateBlockStyles(
  styles: TemplateBlockStyle[],
  order: string[],
) {
  const keys = styles.map(style => style.key);
  if (new Set(keys).size !== keys.length) return "Each component can have only one layout rule.";
  if (keys.some(key => !order.includes(key))) return "A layout rule points to a missing component.";
  return null;
}

export function normaliseTemplateBlockOrder(
  value: unknown,
  builtIns: readonly string[],
  customBlocks: TemplateCustomBlock[],
) {
  const allowed = [...builtIns, ...customBlocks.map(block => customBlockKey(block.id))];
  const supplied = Array.isArray(value) ? value.map(String) : [];
  const ordered = supplied.filter((key, index) => allowed.includes(key) && supplied.indexOf(key) === index);
  return [...ordered, ...allowed.filter(key => !ordered.includes(key))];
}

export function normaliseTemplateBlockStyles(
  value: unknown,
  order: string[],
) {
  const parsed = z.array(templateBlockStyleSchema).max(24).safeParse(value);
  const supplied = parsed.success ? parsed.data : [];
  const byKey = new Map(supplied.filter(style => order.includes(style.key)).map(style => [style.key, style]));
  return order.map(key => byKey.get(key) || {
    key,
    width: "FULL" as const,
    surface: "PLAIN" as const,
    spacing: "STANDARD" as const,
    alignment: "LEFT" as const,
  });
}

export function templateBlockClassName(style: TemplateBlockStyle) {
  return [
    "document-layout-block",
    `block-width-${style.width.toLowerCase().replace("_", "-")}`,
    `block-surface-${style.surface.toLowerCase()}`,
    `block-spacing-${style.spacing.toLowerCase()}`,
    `align-${style.alignment.toLowerCase()}`,
  ].join(" ");
}
