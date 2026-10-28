// Types for the entrypoints of src/legacy.js, the untyped transitional copy of legacy/Code.gs.

// Simple trigger: builds the Revenue Accelerator menu when the Sheet opens.
export function onOpen(e?: GoogleAppsScript.Events.SheetsOnOpen): void;

// Menu and script editor.
export function setup(): void;
export function checkSetup(): string;
export function menuShowThisWeek(): void;
export function menuShowAll(): void;
export function menuRefreshLog(): void;
export function menuCreateLinks(): void;
export function menuEmailLinks(): void;
export function menuAddDemo(): void;
export function menuRemoveDemo(): void;
