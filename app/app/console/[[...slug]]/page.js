import ViewRedirect from "@/components/platform/ViewRedirect";

// /console and any /console/* deep link → unified console view at "/".
// The slug names the section (/console/tasks, /console/security, …) so the
// console opens on the right page instead of always landing on Dashboard.
const SECTIONS = new Set(["dashboard", "tasks", "agent", "security", "usage"]);

export default function ConsoleRedirectPage({ params }) {
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;
  const section = SECTIONS.has(slug) ? slug : null;
  return <ViewRedirect view="console" section={section} />;
}
