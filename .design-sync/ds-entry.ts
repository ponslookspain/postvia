// PostVIA design system — public surface for Claude Design (/design-sync).
// Hand-maintained barrel: the primitives in src/components/ui plus the
// Next-free pattern components. Product-coupled modules (AppShell, the
// product Sidebar, MobileTopBar, landing/*, billing/*) are deliberately
// absent — they depend on next/navigation or prisma-backed auth and are
// page content, not design system. Adding a module here adds it to the
// synced design system; nothing in the app imports this file.

export * from "../src/components/ui/alert";
export * from "../src/components/ui/avatar";
export * from "../src/components/ui/badge";
export * from "../src/components/ui/banner";
export * from "../src/components/ui/button";
export * from "../src/components/ui/calendar";
export * from "../src/components/ui/card";
export * from "../src/components/ui/checkbox";
export * from "../src/components/ui/collapsible";
export * from "../src/components/ui/dialog";
export * from "../src/components/ui/divider";
export * from "../src/components/ui/drawer";
export * from "../src/components/ui/dropdown-menu";
export * from "../src/components/ui/empty";
export * from "../src/components/ui/field";
export * from "../src/components/ui/input";
export * from "../src/components/ui/label";
export * from "../src/components/ui/popover";
export * from "../src/components/ui/progress";
export * from "../src/components/ui/radio-group";
export * from "../src/components/ui/select";
export * from "../src/components/ui/sidebar";
export * from "../src/components/ui/skeleton";
export * from "../src/components/ui/spinner";
export * from "../src/components/ui/switch";
export * from "../src/components/ui/tabs";
export * from "../src/components/ui/text-area";
export * from "../src/components/ui/toast";
export * from "../src/components/ui/tooltip";
export * from "../src/components/layout/PageContainer";
export * from "../src/components/Section";
export * from "../src/components/PageHeader";
export * from "../src/components/StatusBadge";
export * from "../src/components/StateBlock";
export * from "../src/components/PlatformIcon";
export * from "../src/components/AuthShell";
