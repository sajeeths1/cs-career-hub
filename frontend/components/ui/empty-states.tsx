import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SetupMessage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Connect the website to Supabase</CardTitle>
          <CardDescription>
            Create <code>frontend/.env.local</code> with your Project URL and anon key (see
            <code> .env.local.example</code>), then restart <code>npm run dev</code>.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

export function CenteredText({ text }: { text: string }) {
  return (
    <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">{text}</main>
  );
}

export function EmptyText({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}
