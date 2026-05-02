import { AppShell } from "@/components/AppShell";
import { EntryForm } from "@/components/EntryForm";
import { requireSession } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";

export default async function NewEntryPage() {
  const session = await requireSession();
  const dictionary = getDictionary(session.locale);

  return (
    <AppShell session={session} title={dictionary.newEntry}>
      <EntryForm dictionary={dictionary} />
    </AppShell>
  );
}
