import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleSmtpMessage } from "../lib/smtp-message";

test("transactional email MIME includes deliverability headers, alternatives and an inline workspace logo", () => {
  const message = buildGoogleSmtpMessage({
    fromEmail: "orders@example.com",
    fromName: "Kōn-Kōn\r\nBcc: attacker@example.com",
    to: "buyer@example.com",
    replyTo: "support@example.com",
    subject: "Order received · WEB-1001",
    text: "We received your order.",
    html: '<h1>We received your order.</h1><img src="cid:workspace-logo">',
    inlineImages: [{
      cid: "workspace-logo",
      contentType: "image/png",
      filename: "workspace-logo.png",
      content: Buffer.from("workspace-logo"),
    }],
  });

  assert.match(message, /^Date: .+GMT\r\nMessage-ID: <[a-f0-9-]+@example\.com>/);
  assert.match(message, /Reply-To: <support@example\.com>/);
  assert.match(message, /Content-Type: multipart\/related/);
  assert.match(message, /Content-Type: multipart\/alternative/);
  assert.match(message, /Content-ID: <workspace-logo>/);
  assert.match(message, /Content-Disposition: inline; filename="workspace-logo\.png"/);
  assert.doesNotMatch(message, /\r\nBcc:/);
  assert.equal(message.split("\r\n").every((line) => line.length < 998), true);
});
