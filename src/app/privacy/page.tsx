import { Logo } from "@/components/shell/nav";

export const metadata = { title: "Privacy" };

/**
 * Public privacy notice (F15): Google requires a privacy policy link on the OAuth consent screen
 * before the app can be published. The CRM is Tech Squad's internal tool; this says what it does
 * with the Google Calendar data it is allowed to see. English only (it is for Google's screen).
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-[15px] leading-relaxed">
      <Logo className="mb-4 size-12" />
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Privacy notice</h1>
      <p className="mb-6 text-sm text-muted-foreground">TechSquad CRM (Managing System) · Tech Squad, Miami, Florida</p>

      <h2 className="mb-1 mt-6 text-lg font-semibold">What this application is</h2>
      <p>TechSquad CRM is the internal management system of Tech Squad, an audio, video and automation installation company. Only Tech Squad staff with a login can use it. It is not offered to the public.</p>

      <h2 className="mb-1 mt-6 text-lg font-semibold">Google user data</h2>
      <p>
        When an administrator connects the company&apos;s Google account, the application uses the Google Calendar API to read the events of one chosen calendar and to create, update or delete events in that same calendar. The events are the company&apos;s own job
        visits. The data read (event title, time, place, description, colour) is stored in the company&apos;s database so that visits can be scheduled, matched to projects and shown to staff. No other Google data is read.
      </p>
      <p className="mt-2">
        Google user data is used only to provide this scheduling feature. It is not sold, not used for advertising, and not shared with any third party, except for the hosting providers that run the application (Vercel and Supabase) and, when the AI matching
        option is on, event titles and places sent to Anthropic&apos;s Claude API to decide which project an event belongs to. The use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use
        requirements.
      </p>

      <h2 className="mb-1 mt-6 text-lg font-semibold">Keeping and deleting data</h2>
      <p>
        Access tokens are stored encrypted. An administrator can disconnect the Google account at any time from the application&apos;s Admin area, which deletes the tokens; the company can also remove the application&apos;s access from the Google account&apos;s
        security settings. Calendar data kept in the company database is deleted on request to the company.
      </p>

      <h2 className="mb-1 mt-6 text-lg font-semibold">Contact</h2>
      <p>Questions about this notice: info@tsav.net.</p>
    </main>
  );
}
