import type { Role, SpaceKind } from "@/lib/types";

export function canWriteTransactions(role: Role): boolean {
  return role === "editor" || role === "admin" || role === "owner";
}

export function canDelete(role: Role): boolean {
  return role === "admin" || role === "owner";
}

export function canManage(role: Role): boolean {
  return role === "admin" || role === "owner";
}

export function canInvite(role: Role, kind: SpaceKind): boolean {
  return kind !== "personal" && canManage(role);
}

export function canCreateRecurring(role: Role): boolean {
  return canWriteTransactions(role);
}

export function canEditRecurring(role: Role): boolean {
  return canManage(role);
}

export function isOwner(role: Role): boolean {
  return role === "owner";
}
