import type { Metadata } from "next";
import LegalPageShell, { LegalSection } from "@/components/LegalPageShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Postvia collects, uses, stores, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="Privacy Policy"
      effectiveDate="September 12, 2026"
      currentPage="privacy"
      intro="This policy explains what personal data Postvia handles, why, where it is stored, and what choices you have. Postvia is operated as an independent project; there is no advertising, no third-party analytics or tracking in the app, and your data is never sold."
    >
      <LegalSection heading="1. Who Operates Postvia">
        <p>
          Postvia is operated as an independent project by its developer. No
          legal-entity name, registered address, or telephone number is
          published for the project at this time. For any privacy question
          or request, contact{" "}
          <a
            href="mailto:hello@postvia.online"
            className="underline hover:text-foreground"
          >
            hello@postvia.online
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Account Data">
        <p>
          When you sign up, we store your name and email address, whether
          your email address has been verified, and a one-way hash of your
          password (never the password itself). If you sign in with Google,
          we store the name, email address, and profile image Google shares,
          and link it to your Postvia account. You can change your name in
          Settings at any time.
        </p>
      </LegalSection>

      <LegalSection heading="3. Authentication and Session Data">
        <p>
          Sign-in and sessions run on our own infrastructure using the
          open-source Better Auth library &mdash; no third-party
          authentication vendor is involved. For each session we store a
          session token, its expiry time, and, where your browser provides
          them, your IP address and user-agent string. Sessions expire
          automatically and are deleted when you sign out on all devices or
          delete your account.
        </p>
      </LegalSection>

      <LegalSection heading="4. Email Verification Data">
        <p>
          Because email verification is required, we keep short-lived
          verification records (an identifier, a secret value, and an expiry
          time) to confirm your address. Verification links expire after 60
          minutes and the records expire with them. The verification email
          itself is delivered by Resend from{" "}
          <span className="font-medium">hello@postvia.online</span>; to send
          it, Resend necessarily receives your email address and the message
          content.
        </p>
      </LegalSection>

      <LegalSection heading="5. Connected Social Account Data">
        <p>
          When you connect Instagram, Threads, TikTok, or X through its
          official OAuth flow, we store the platform name, your platform
          account ID, and your public username or handle, together with the
          OAuth credentials described in sections 6&ndash;8. These records
          exist only to maintain the integrations you connected and to carry
          out publishing and status checks you request.
        </p>
      </LegalSection>

      <LegalSection heading="6. OAuth Access Tokens">
        <p>
          For every connected social account we store the platform&rsquo;s
          access token. The token is used only to call that platform&rsquo;s
          official API on your behalf &mdash; publishing content you
          submitted, checking publication status, and refreshing or revoking
          access. Tokens are stored server-side in our database and are
          never displayed in the app or sent to your browser.
        </p>
      </LegalSection>

      <LegalSection heading="7. Refresh Tokens">
        <p>
          Where a platform issues a refresh token alongside the access token
          (for example X and TikTok), we store it for the same limited
          purpose: obtaining a fresh access token without asking you to
          reconnect. Platforms that do not issue refresh tokens have no such
          record. Refresh tokens are stored server-side under the same
          protections as access tokens.
        </p>
      </LegalSection>

      <LegalSection heading="8. Token Expiration">
        <p>
          Alongside each token we store its expiry time where the platform
          reports one. Expired tokens are refreshed automatically where the
          platform supports it; otherwise the integration stops working
          until you reconnect the account. You can see at any time which
          accounts are connected on the Accounts page.
        </p>
      </LegalSection>

      <LegalSection heading="9. Platform IDs and Usernames">
        <p>
          We store the account identifiers and usernames the platforms
          report during connection (for example your Instagram account ID
          and username, or your TikTok and X user IDs and handles). This is
          how Postvia addresses the correct account when publishing and how
          it shows you which accounts are connected. Usernames are public
          handles you already publish under on those platforms.
        </p>
      </LegalSection>

      <LegalSection heading="10. Your Posts and Drafts">
        <p>
          We store the content you create in Postvia: post text and captions,
          per-platform text and settings overrides, and drafts. Posts you
          delete are removed from our database; deleting a post does not
          remove copies already published to third-party platforms (see
          section 26).
        </p>
      </LegalSection>

      <LegalSection heading="11. Images and Videos">
        <p>
          Images and videos you upload are stored with their filename, MIME
          type, file size, and the post they belong to. Still images may be
          converted to a canonical JPEG form to prepare them for publishing;
          animated GIFs are preserved as uploaded. Files that are never
          attached to a post are removed automatically, and all of your
          files are deleted from storage when you delete the post or your
          account.
        </p>
      </LegalSection>

      <LegalSection heading="12. Scheduling, Date, Time, and Timezone">
        <p>
          When you schedule a post, we store the scheduled date and time
          together with the timezone you selected, so the post is published
          at the moment you intended regardless of where you travel. Your
          notification and product-update preferences (both on by default
          and changeable in Settings) are stored with your account.
        </p>
      </LegalSection>

      <LegalSection heading="13. Publication Status">
        <p>
          For every post and every platform delivery we store the status
          (draft, scheduled, publishing, published, partially published, or
          failed), publication timestamps, and any error message the
          platform returned. This is your publication history: it lets you
          see what went where, diagnose failures, and retry.
        </p>
      </LegalSection>

      <LegalSection heading="14. External Platform Post IDs">
        <p>
          When a platform accepts your content, we store the identifier it
          returns &mdash; for example a post or media-container ID, or, for
          TikTok&rsquo;s asynchronous processing, the publish job identifier
          &mdash; so we can track completion, avoid publishing twice, and
          link your history to the published item. These identifiers are
          created by the platforms, not by Postvia.
        </p>
      </LegalSection>

      <LegalSection heading="15. Media Processing">
        <p>
          Before storage and publishing, uploads are validated against the
          published limits (images JPEG, PNG, WebP, or GIF up to 10&nbsp;MB;
          videos MP4, WebM, or MOV up to 100&nbsp;MB; at most 4 files per
          post &mdash; the platform-wide maximums; your plan may apply a
          lower limit, see{" "}
          <a href="/pricing" className="underline underline-offset-2">
            Pricing
          </a>
          ). Processing happens on our own infrastructure for the sole
          purpose of delivering the features you use; uploads are never used
          for advertising or shared with data brokers.
        </p>
        <p>
          Once a post is fully published, its original media is kept for a
          limited time (3 months on Free, 12 months on Growth and Scale)
          and then automatically deleted to control storage cost. This
          never deletes the post, its caption, or its publishing history,
          and never affects a draft, scheduled, or partially-published
          post&apos;s media.
        </p>
      </LegalSection>

      <LegalSection heading="16. Vercel Blob Storage">
        <p>
          Your uploaded images and videos are stored as private objects in
          Vercel Blob. Objects are not public: they are served only to you
          while authenticated, and to a platform at the moment of publishing
          through short-lived, single-file signed links. Media records and
          files are deleted when you delete the post or your account.
        </p>
      </LegalSection>

      <LegalSection heading="17. PostgreSQL Database (Neon)">
        <p>
          All records described in sections 2&ndash;14 live in a managed
          PostgreSQL database hosted by Neon. Day-to-day operation, backups,
          and database-level security are provided by Neon under its own
          terms; Postvia accesses the data only to run the Service.
        </p>
      </LegalSection>

      <LegalSection heading="18. Hosting (Vercel)">
        <p>
          The Postvia application, its serverless functions, background
          jobs, and scheduled publishing checks run on Vercel&rsquo;s
          hosting infrastructure. Requests necessarily pass through
          Vercel&rsquo;s network, which processes IP addresses and technical
          request data to deliver the Service.
        </p>
      </LegalSection>

      <LegalSection heading="19. Transactional Email (Resend)">
        <p>
          Account verification emails are delivered by Resend, from{" "}
          <span className="font-medium">Postvia &lt;hello@postvia.online&gt;</span>{" "}
          with reply-to{" "}
          <span className="font-medium">hello@postvia.online</span>. Resend
          receives your email address and the verification message for
          delivery. Postvia sends no marketing email through Resend; the
          only automated email is account verification.
        </p>
      </LegalSection>

      <LegalSection heading="20. Social Platform APIs">
        <p>
          When you publish, Postvia transmits your content and the minimum
          associated data (your stored OAuth token, the media file via a
          short-lived link, and identifiers such as caption or title) to
          that platform&rsquo;s official API. Each platform then processes
          that data independently under its own terms and privacy policy:
          Instagram and Threads under Meta&rsquo;s policies, TikTok under
          TikTok&rsquo;s policies, X under X Corp.&rsquo;s policies, and
          Google sign-in data under Google&rsquo;s policies. Postvia does
          not control what platforms do with published content.
        </p>
      </LegalSection>

      <LegalSection heading="21. TikTok-Specific Data Processing">
        <p>
          TikTok publishing uses TikTok Login Kit and the TikTok Content
          Posting API. Postvia uses TikTok OAuth to obtain and store the
          OAuth credentials (access and refresh tokens with expiries)
          necessary to maintain the integration, reads your TikTok account
          ID and username plus the privacy-level options TikTok reports for
          your account, and uploads the authorized video in chunks to
          TikTok&rsquo;s servers together with the title and privacy setting
          you chose. TikTok processes the published video asynchronously;
          Postvia keeps TikTok&rsquo;s publish identifier only to track
          completion and to resume safely. Once published, the video is
          governed by TikTok&rsquo;s terms and privacy policy.
        </p>
      </LegalSection>

      <LegalSection heading="22. Security Logging and Error Diagnostics">
        <p>
          To keep the Service secure and working, Postvia records
          operational events: session records with IP address and user-agent
          (section 3), per-platform publication error messages (section 13),
          and error diagnostics. Error monitoring is provided by Sentry on
          both server and browser: events are sent only when configured,
          never include personal data by default, and pass through a
          scrubbing filter that redacts tokens, secrets, OAuth codes, and
          similar values before they leave our servers. Session Replay is
          off. There is no third-party analytics, advertising measurement,
          or cross-site tracking in the app.
        </p>
      </LegalSection>

      <LegalSection heading="23. Cookies and Session Technologies">
        <p>
          Postvia uses cookies strictly as necessary to operate sign-in:
          session cookies that keep you authenticated after login, and
          short-lived cookies that carry OAuth flows (Google sign-in and
          social-account connections) through securely. There are no
          advertising, marketing, analytics, or third-party tracking
          cookies. Disabling strictly-necessary cookies prevents signing in.
        </p>
      </LegalSection>

      <LegalSection heading="24. Legal Bases (GDPR / EEA)">
        <p>
          Where the General Data Protection Regulation (GDPR) or equivalent
          European data-protection law applies, we process personal data on
          the following legal bases:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            <span className="font-medium">Contract:</span> creating and
            maintaining your account, authenticating you, connecting the
            social accounts you choose, scheduling, publishing your content,
            and delivering the features you use
          </li>
          <li>
            <span className="font-medium">Legitimate interests:</span>{" "}
            maintaining security, preventing abuse and fraud, troubleshooting
            errors, and operating the Service
          </li>
          <li>
            <span className="font-medium">Consent:</span> where required by
            law &mdash; for example product-update communications, which you
            can switch off in Settings
          </li>
          <li>
            <span className="font-medium">Legal obligations:</span>{" "}
            compliance with applicable laws, regulations, and legal processes
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="25. Data Retention">
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Account, post, media, and connected-account data is retained for
            as long as your account exists and you keep using the Service.
          </li>
          <li>
            Sessions expire automatically; verification records expire with
            their 60-minute links; uploaded files never attached to a post
            are removed automatically (orphaned files are swept within about
            a day).
          </li>
          <li>
            Connected social account data (identifiers and OAuth
            credentials) is retained until you disconnect the integration or
            delete your account.
          </li>
          <li>
            Some data may be retained for a limited period as reasonably
            necessary to comply with legal obligations, resolve disputes,
            and enforce our rights.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="26. Account Deletion">
        <p>
          You can delete your Postvia account at any time from{" "}
          <span className="font-medium">Settings &rarr; Delete account</span>,
          after confirming the deletion. Account deletion permanently
          removes, in one transaction:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Your Postvia account and user record, including preferences</li>
          <li>Sessions and sign-in connections (including Google)</li>
          <li>Posts, drafts, per-platform delivery records, and statuses</li>
          <li>Media records and the stored files themselves</li>
          <li>Connected social accounts and their stored OAuth credentials</li>
        </ul>
        <p>
          Deleting your posts also stops their still-scheduled publications.
          <span className="font-medium"> Important:</span> deletion removes
          only data under Postvia&rsquo;s control. Content already published
          to Instagram, TikTok, Threads, X, or other platforms stays there
          under those platforms&rsquo; policies; remove it on the platform
          itself.
        </p>
      </LegalSection>

      <LegalSection heading="27. Social Account Disconnect">
        <p>
          You can disconnect any connected social account at any time from
          the Accounts page. Disconnecting deletes that account&rsquo;s
          stored OAuth credentials from Postvia immediately and prevents any
          future publishing to it through Postvia. It does not delete
          content already published to the platform.
        </p>
      </LegalSection>

      <LegalSection heading="28. OAuth Token Revocation">
        <p>
          When you disconnect an account or delete your Postvia account,
          Postvia asks the platform to revoke its access wherever the
          platform offers a revocation API &mdash; currently X, TikTok, and
          Instagram &mdash; on a best-effort basis that never blocks the
          local deletion of your credentials. Threads currently offers no
          equivalent revocation call, so for Threads the stored credentials
          are deleted from Postvia without a platform-side revocation
          request.
        </p>
        <p>
          Independently of Postvia, you can always revoke access yourself in
          each platform&rsquo;s own settings (for example your Meta or
          Instagram settings, TikTok&rsquo;s authorized-app settings, X
          settings, or Google account permissions), which takes effect even
          if a best-effort revocation request failed.
        </p>
      </LegalSection>

      <LegalSection heading="29. Your Rights">
        <p>
          Where applicable law provides them (including GDPR/EEA), you have
          the right to:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Access the personal data we hold about you</li>
          <li>Rectify inaccurate or incomplete data</li>
          <li>Request erasure of your data</li>
          <li>Restrict the processing of your data</li>
          <li>Object to processing based on legitimate interests</li>
          <li>Receive your data in a portable format</li>
          <li>Withdraw consent where consent is the legal basis for processing</li>
          <li>
            Lodge a complaint with a supervisory authority in your
            jurisdiction
          </li>
        </ul>
        <p>
          The fastest way to exercise most of these rights is in the app
          itself: edit your profile in Settings, disconnect accounts on the
          Accounts page, delete individual posts, or delete your account in
          Settings. For access, portability, or anything you cannot do
          yourself, write to{" "}
          <a
            href="mailto:hello@postvia.online"
            className="underline hover:text-foreground"
          >
            hello@postvia.online
          </a>
          . These rights are not absolute; applicable law may permit or
          require us to retain certain data.
        </p>
      </LegalSection>

      <LegalSection heading="30. International Transfers">
        <p>
          Postvia&rsquo;s infrastructure processes and stores data in more
          than one region: application hosting runs on Vercel&rsquo;s
          infrastructure, and the managed PostgreSQL database is hosted by
          Neon. Depending on configuration, your data may therefore be
          processed outside your country, including in the United States and
          the European Union. Where required by applicable law, such
          transfers rely on the contractual safeguards of our infrastructure
          providers. Publishing to a social platform additionally transfers
          your published content to that platform&rsquo;s own
          infrastructure, wherever it operates.
        </p>
      </LegalSection>

      <LegalSection heading="31. Security Measures">
        <p>
          We use reasonable technical and organizational measures to protect
          your data, including:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>HTTPS encryption for data in transit</li>
          <li>Passwords stored only as one-way hashes, never in plain text</li>
          <li>OAuth tokens stored server-side and never exposed to the browser</li>
          <li>
            Private media storage with short-lived, single-file access links
          </li>
          <li>
            Error reports scrubbed of secrets and personal data before they
            leave our servers
          </li>
          <li>
            Minimal collection: only the data needed for the features you use
          </li>
        </ul>
        <p>
          No method of transmission or storage is perfectly secure. We cannot
          guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="32. Children&rsquo;s Privacy">
        <p>
          Postvia is not directed at children under the age of 16. We do not
          knowingly collect personal data from children. If you are under
          the age of 16, do not use Postvia. If you become aware that a
          child has provided us with personal data, please write to{" "}
          <a
            href="mailto:hello@postvia.online"
            className="underline hover:text-foreground"
          >
            hello@postvia.online
          </a>{" "}
          and we will take steps to delete it.
        </p>
      </LegalSection>

      <LegalSection heading="33. Changes to This Policy">
        <p>
          If this policy changes, the &ldquo;Effective date&rdquo; above is
          updated. Material changes will be pointed out in the app where
          practical. We encourage you to review this policy periodically.
        </p>
      </LegalSection>

      <LegalSection heading="34. Privacy Contact">
        <p>
          Privacy questions and data subject requests:{" "}
          <a
            href="mailto:hello@postvia.online"
            className="underline hover:text-foreground"
          >
            hello@postvia.online
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
