import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("schedules", "routes/schedules.tsx"),
  route("schedules/new", "routes/schedules.new.tsx"),
  route("schedules/:id", "routes/schedules.$id.tsx"),
  route("schedules/:id/edit", "routes/schedules.$id_.edit.tsx"),
  route("approvals", "routes/approvals.tsx"),
  route("notifications", "routes/notifications.tsx"),
  route("set-language", "routes/set-language.tsx"),
] satisfies RouteConfig;
