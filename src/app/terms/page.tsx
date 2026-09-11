import type { Metadata } from "next";
import LegalPageShell, { LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Postvia - compose, schedule, and publish social media posts.",
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="Terms of Service"
      effectiveDate="September 11, 2026"
      intro="These Terms of Service govern your use of Postvia, a web application that lets you compose posts with text and media, preview them per platform, schedule them, and publish them to social accounts you connect - currently Threads and X. By creating an account or using the service, you agree to these terms."
    >
      <LegalSection heading="1. The service">
        <p>
          Postvia provides a composer for creating posts, a library of saved
          drafts and published posts, scheduling, and publishing to the social
          platforms you connect. The service is provided by its developer as an
          independent project. It is not affiliated with, endorsed by, or
          sponsored by Meta, Threads, X Corp., or any other platform.
        </p>
      </LegalSection>

      <LegalSection heading="2. Accounts and authentication">
        <p>
          You create an account with your name, email address, and a password.
          You are responsible for keeping your credentials confidential and for
          all activity that occurs under your account. You must provide a valid
          email address; please notify us if it stops working.
        </p>
      </LegalSection>

      <LegalSection heading="3. Connected social accounts (OAuth)">
        <p>
          Publishing requires connecting a social account through the official
          OAuth flow of the target platform (for example, Threads or X). When you
          connect an account, the platform grants Postvia access tokens with the
          permissions you approve - such as reading your basic profile and
          publishing on your behalf. You can disconnect an account at any time
          from the Accounts page, which deletes the stored tokens.
        </p>
      </LegalSection>

      <LegalSection heading="4. Creating, scheduling, and publishing posts">
        <p>
          You can save posts as drafts, schedule a post for a chosen date and
          time, or publish immediately. A scheduled time applies to the whole
          post and all platforms selected for it. Publishing works by sending
          your post content to the connected platforms&rsquo; official APIs.
          Publishing may fail - for example, when a platform API is unavailable,
          your access token expires, or a platform rejects the content. Failed
          posts can be retried from the post page.
        </p>
        <p>
          Scheduling depends on periodic background checks, so a scheduled post
          may be published slightly after the time you selected.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your content">
        <p>
          You keep all rights to the text and media you submit. By using the
          service, you grant Postvia only the limited permission it needs to
          store, display, and - when you ask it to - publish your content to the
          platforms you select. You are solely responsible for the content you
          create and publish, and you confirm that you have the rights to it.
        </p>
      </LegalSection>

      <LegalSection heading="6. Media uploads">
        <p>
          Postvia accepts images (JPG, PNG, WebP, GIF up to 10&nbsp;MB) and
          videos (MP4, WebM up to 100&nbsp;MB), with a maximum of 4 media files
          per post. Media is stored in private Vercel Blob storage and is only
          served to you (authenticated) and to a platform at the moment of
          publishing through short-lived, single-file links. Supported media
          types differ per platform; the composer shows what a platform accepts.
          Publishing media to X is not currently available.
        </p>
      </LegalSection>

      <LegalSection heading="7. Third-party platforms and APIs">
        <p>
          Your use of each connected platform remains subject to that
          platform&rsquo;s terms and policies. Postvia relies on third-party APIs
          and infrastructure (Meta&rsquo;s Threads API, the X API, Vercel, Neon
          PostgreSQL, Vercel Blob). We are not responsible for the actions, outages,
          rate limits, policy changes, or content decisions of those services.
        </p>
      </LegalSection>

      <LegalSection heading="8. Service availability and changes">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without any uptime guarantee. Features may be added
          or removed, and the service may be modified, suspended, or
          discontinued at any time. The service is currently offered free of
          charge; if paid plans are introduced, they will be described before
          billing starts.
        </p>
      </LegalSection>

      <LegalSection heading="9. Prohibited use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            post content that is unlawful, infringing, harassing, hateful, or
            otherwise violates a platform&rsquo;s rules;
          </li>
          <li>
            use the service to spam, manipulate, or abuse any platform or the
            service itself;
          </li>
          <li>
            attempt to gain unauthorized access to other accounts, systems, or
            APIs, or to circumvent usage limits and security measures;
          </li>
          <li>
            resell or provide the service to third parties as your own product
            without permission;
          </li>
          <li>
            misuse scheduling or publishing to overload platform APIs after
            being asked to stop.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="10. Account deletion">
        <p>
          You can delete your account at any time from Settings. Deletion removes
          your account, sessions, stored posts, media files, and saved social
          account tokens. Publishing posts that were already scheduled stops.
          Content already published to third-party platforms stays there until
          you remove it on that platform.
        </p>
      </LegalSection>

      <LegalSection heading="11. Suspension and termination">
        <p>
          We may suspend or terminate accounts that violate these terms, abuse
          the service, or put the service or its users at risk. You may stop
          using the service and delete your account at any time.
        </p>
      </LegalSection>

      <LegalSection heading="12. Liability">
        <p>
          To the extent permitted by law, Postvia and its developer are not
          liable for indirect or consequential damages, failed or misfired
          publications, or actions taken by third-party platforms in response to
          content published through the service.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to these terms">
        <p>
          We may update these terms. When we do, we will revise the
          &ldquo;Effective date&rdquo; at the top of this page. Material changes
          will be announced in the app where practical. Continued use after the
          effective date means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact">
        <p>
          Questions about these terms can be sent through the project&rsquo;s
          GitHub repository: github.com/ponslookspain/postvia
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
