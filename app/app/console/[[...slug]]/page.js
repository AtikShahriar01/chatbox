import ViewRedirect from "@/components/platform/ViewRedirect";

// /console and any /console/* deep link → unified console view at "/"
export default function ConsoleRedirectPage() {
  return <ViewRedirect view="console" />;
}
