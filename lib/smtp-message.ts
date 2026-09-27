import { randomUUID } from "node:crypto";

export type InlineEmailImage = {
  cid: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  filename: string;
  content: Buffer;
};

function mimeWord(value: string) {
  return /^[\x20-\x7e]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value).toString("base64")}?=`;
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function base64Lines(value: string | Buffer) {
  return (Buffer.isBuffer(value) ? value : Buffer.from(value))
    .toString("base64")
    .match(/.{1,76}/g)?.join("\r\n") || "";
}

export function buildGoogleSmtpMessage(input: {
  fromEmail: string;
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  inlineImages?: InlineEmailImage[];
}) {
  const alternative = `konkon-alt-${randomUUID()}`;
  const related = `konkon-related-${randomUUID()}`;
  const domain = input.fromEmail.split("@")[1]?.replace(/[^A-Za-z0-9.-]/g, "") || "localhost";
  const headers = [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${domain}>`,
    `From: ${mimeWord(safeHeader(input.fromName))} <${safeHeader(input.fromEmail)}>`,
    `To: <${safeHeader(input.to)}>`,
    ...(input.replyTo ? [`Reply-To: <${safeHeader(input.replyTo)}>`] : []),
    `Subject: ${mimeWord(safeHeader(input.subject))}`,
    "MIME-Version: 1.0",
    "X-Auto-Response-Suppress: All",
    `Content-Type: multipart/${input.inlineImages?.length ? "related" : "alternative"}; boundary=\"${input.inlineImages?.length ? related : alternative}\"`,
    "",
  ];
  const alternativeParts = [
    ...(input.inlineImages?.length ? [`--${related}`, `Content-Type: multipart/alternative; boundary=\"${alternative}\"`, ""] : []),
    `--${alternative}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(input.text),
    `--${alternative}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(input.html),
    `--${alternative}--`,
  ];
  const images = (input.inlineImages || []).flatMap((image) => [
    `--${related}`,
    `Content-Type: ${image.contentType}; name=\"${safeHeader(image.filename)}\"`,
    "Content-Transfer-Encoding: base64",
    `Content-ID: <${safeHeader(image.cid)}>`,
    `Content-Disposition: inline; filename=\"${safeHeader(image.filename)}\"`,
    "",
    base64Lines(image.content),
  ]);
  return [...headers, ...alternativeParts, ...images, ...(images.length ? [`--${related}--`] : []), ""].join("\r\n");
}
