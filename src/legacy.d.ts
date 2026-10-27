// Types for the entrypoints of src/legacy.js, the untyped transitional copy of legacy/Code.gs.
// Each declaration disappears when its function moves into a typed module.

// Simple trigger: builds the Revenue Accelerator menu when the Sheet opens.
export function onOpen(e?: GoogleAppsScript.Events.SheetsOnOpen): void;

// Menu and script editor.
export function setup(): void;
export function checkSetup(): string;
export function menuShowThisWeek(): void;
export function menuShowAll(): void;
export function menuSendReplies(): void;
export function menuRefreshLog(): void;
export function menuPreparePage(): void;
export function menuCreateLinks(): void;
export function menuEmailLinks(): void;
export function menuEmailsOn(): void;
export function menuEmailsOff(): void;
export function menuAddDemo(): void;
export function menuRemoveDemo(): void;
export function menuRemindersNow(): void;
export function menuDigestsNow(): void;

// Time-driven triggers created by menuEmailsOn.
export function autoMondayReminder(): void;
export function autoDigests(): void;
export function autoDaily(): void;
