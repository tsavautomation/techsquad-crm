import type { CurrentUser } from "@/lib/auth/session";

// PI-h: who sees Finance (the tab, the review cards, the Finance card on a project).
export const FINANCE_PERMISSION = "administrative.finance.view_page";
export const canSeeFinance = (user: CurrentUser) => user.isSysadmin || user.permissions.has(FINANCE_PERMISSION) || user.permissions.has("administrative.transactions.view_page");

// FIN-p: Administrative › Purchasing has its own permission (the buyers), and everyone with Finance or Transactions sees it too.
export const PURCHASING_PERMISSION = "administrative.purchasing.view_page";
export const canSeePurchasing = (user: CurrentUser) => user.permissions.has(PURCHASING_PERMISSION) || canSeeFinance(user);
