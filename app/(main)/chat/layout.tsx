import { redirect } from "next/navigation";

// The owner no longer uses the AI Chat page. Redirect both /chat and nested
// conversation URLs to the Library without loading chat history or UI.
export default function ChatRouteLayout() {
  redirect("/library");
}
