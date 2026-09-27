import type { Db } from "mongodb";

export type SystemMode = "OPEN" | "READ_ONLY" | "CLOSED";

export type SystemControl = {
  mode: SystemMode;
  reason: string;
  reopenAt: Date | null;
  scannerGeneration: number;
  platformStatus: string;
  platformReason: string;
  platformPolicyVersion: number;
  platformCheckedAt: Date | null;
  updatedAt?: Date;
};

export const DEFAULT_SYSTEM_CONTROL: SystemControl = {
  mode: "OPEN",
  reason: "",
  reopenAt: null,
  scannerGeneration: 1,
  platformStatus: "UNMANAGED",
  platformReason: "",
  platformPolicyVersion: 0,
  platformCheckedAt: null,
};

export async function getSystemControl(db: Db): Promise<SystemControl> {
  const saved = await db.collection("systemControls").findOne({ _id: "workspace" as never });
  if (!saved) return DEFAULT_SYSTEM_CONTROL;
  const reopenAt = saved.reopenAt instanceof Date ? saved.reopenAt : null;
  const mode = ["OPEN", "READ_ONLY", "CLOSED"].includes(String(saved.mode)) ? saved.mode as SystemMode : "OPEN";
  if (mode !== "OPEN" && reopenAt && reopenAt <= new Date()) {
    const now = new Date();
    await db.collection("systemControls").updateOne(
      { _id: "workspace" as never, mode },
      { $set: { mode: "OPEN", reason: "", reopenAt: null, updatedAt: now }, $inc: { scannerGeneration: 1 } },
    );
    return {
      ...DEFAULT_SYSTEM_CONTROL,
      scannerGeneration: Number(saved.scannerGeneration || 1) + 1,
      platformStatus: String(saved.platformStatus || "UNMANAGED"),
      platformReason: String(saved.platformReason || ""),
      platformPolicyVersion: Number(saved.platformPolicyVersion || 0),
      platformCheckedAt: saved.platformCheckedAt instanceof Date ? saved.platformCheckedAt : null,
      updatedAt: now,
    };
  }
  return {
    mode,
    reason: String(saved.reason || ""),
    reopenAt,
    scannerGeneration: Number(saved.scannerGeneration || 1),
    platformStatus: String(saved.platformStatus || "UNMANAGED"),
    platformReason: String(saved.platformReason || ""),
    platformPolicyVersion: Number(saved.platformPolicyVersion || 0),
    platformCheckedAt: saved.platformCheckedAt instanceof Date ? saved.platformCheckedAt : null,
    updatedAt: saved.updatedAt instanceof Date ? saved.updatedAt : undefined,
  };
}

export function isWritePermission(permission: string) {
  return permission.endsWith(".write") || permission.endsWith(".manage") || permission.endsWith(".approve") || permission.endsWith(".submit") || permission.endsWith(".pay") || permission === "pos.sell" || permission === "owner.control";
}
