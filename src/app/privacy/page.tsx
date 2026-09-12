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
      effectiveDate="September 11, 2026"
      currentPage="privacy"
      intro="This policy explains what personal data Postvia handles, why, where it is stored, and what choices you have. Postvia is a social media management tool operated as an independent project; there is no advertising, no third-party analytics tracking in the app, and your data is never sold."
    >
      <LegalSection heading="1. Introduction">
        <p>
          Postvia is a web-based social media management tool that lets you
          compose posts, connect social accounts, schedule content, and publish
          to the platforms you authorize. This Privacy Policy applies to all
          users of Postvia and covers all data we collect, process, and store
          in connection with the service.
        </p>
        <p>
          If you have questions about this policy, you can reach us through
          the project&rsquo;s GitHub repository
          (github.com/ponslookspain/postvia).
        </p>
      </LegalSection>

      <LegalSection heading="2. Information We Collect">
        <p className="font-medium">A. Account information</p>
        <p>
          When you sign up, we collect your name, email address, and a
          hashed version of your password. We also store session
          authentication data, including your session token, its expiry time,
          and (depending on your browser) your IP address and user-agent
          information. You can change your name and notification preferences
          at any time in Settings.
        </p>

        <p className="font-medium">B. Connected social account information</p>
        <p>
          When you connect a social platform (Instagram, TikTok, Threads, or
          X) through its official OAuth flow, we store the following to
          maintain the integration and perform actions you request:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Platform name, your platform account ID, and your public
            username or handle
          </li>
          <li>
            OAuth authorization information, including access tokens and
            (where applicable) refresh tokens and their expiration dates
          </li>
        </ul>
        <p>
          OAuth credentials are stored server-side and are never displayed in
          the app. They are processed and retained as necessary to maintain
          connected social integrations and to publish content on your behalf
          when you request it.
        </p>

        <p className="font-medium">C. User content</p>
        <p>
          We store the content you create and submit through Postvia,
          including:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Post text and captions</li>
          <li>Draft posts</li>
          <li>Images and videos you upload</li>
          <li>
            Scheduling information (date, time, and timezone selections)
          </li>
          <li>
            Publication status and the identifier returned by a platform
            after a successful publish
          </li>
        </ul>

        <p className="font-medium">D. Technical and security information</p>
        <p>
          We collect IP address, browser and device information as part of
          session authentication records. This information is used for
          security, abuse prevention, and session management.
        </p>

        <p className="font-medium">Cookies and session technologies</p>
        <p>
          Postvia uses session cookies strictly for authentication purposes
          so the app can recognize you after you sign in. We do not use
          advertising, marketing, or third-party tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="3. How We Use Your Information">
        <p>We use the information described above to:</p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Authenticate you and manage your session</li>
          <li>Provide and operate the Postvia service</li>
          <li>Connect, maintain, and manage your social account integrations</li>
          <li>
            Publish content on your behalf when you request it, and show your
            publication history and status
          </li>
          <li>
            Process, validate, optimize, compress, resize, convert, store,
            retrieve, and deliver user-provided content as reasonably
            necessary to provide and improve the Service (for example,
            validating file types and sizes, preparing media for your
            selected platforms, and delivering content to publishing APIs)
          </li>
          <li>
            Maintain security, prevent abuse, troubleshoot, and diagnose
            errors
          </li>
          <li>
            Communicate service-related and product-update communications
            where you have opted in
          </li>
          <li>Comply with applicable legal obligations</li>
        </ul>
        <p>
          We do not profile you for advertising. We do not sell, rent, or
          trade your personal data.
        </p>
      </LegalSection>

      <LegalSection heading="4. Legal Bases (GDPR / EEA)">
        <p>
          Where the General Data Protection Regulation (GDPR) or equivalent
          European data-protection law applies, we process personal data on
          the following legal bases:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            <span className="font-medium">Contract:</span> authentication,
            providing the service, connecting social accounts, publishing
            your content, scheduling, and delivering the features you use
          </li>
          <li>
            <span className="font-medium">Legitimate interests:</span>{" "}
            maintaining security, preventing abuse and fraud, improving the
            service, and supporting customer requests
          </li>
          <li>
            <span className="font-medium">Consent:</span> where required by
            law (for example, marketing or product-update communications)
          </li>
          <li>
            <span className="font-medium">Legal obligations:</span>{" "}
            compliance with applicable laws, regulations, and legal
            processes
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Social Platform Integrations">
        <p>
          Postvia integrates with third-party social platforms through their
          official APIs. By connecting a social account, you voluntarily
          provide Postvia with the account information and authorization
          credentials necessary to operate the integration. Each platform
          processes data independently under its own terms and privacy
          policies. Postvia does not control third-party platform
          availability, policies, or behavior.
        </p>

        <p className="font-medium">Instagram (Meta)</p>
        <p>
          Postvia integrates with Instagram through Instagram Login (OAuth)
          and the Instagram Content Publishing API. When you connect an
          Instagram Business or Creator account, we process your Instagram
          account ID, username, and OAuth authorization credentials to
          publish photos and video Reels on your behalf and to manage the
          integration. The permissions requested are{" "}
          <code>instagram_business_basic</code> and{" "}
          <code>instagram_business_content_publish</code>. Once published,
          your content is governed by Meta&rsquo;s terms and privacy policy.
          You can disconnect your Instagram account at any time from the
          Postvia Accounts page, or revoke Postvia&rsquo;s access directly
          from your Instagram or Meta account settings.
        </p>

        <p className="font-medium">TikTok</p>
        <p>
          Postvia integrates with TikTok through TikTok Login Kit and the
          TikTok Content Posting API. When you connect a TikTok account, we
          process your TikTok account ID, username, and OAuth credentials to
          publish authorized videos on your behalf and to manage the
          integration. Once published, your content is governed by
          TikTok&rsquo;s terms and privacy policy. You can disconnect your
          TikTok account at any time from the Postvia Accounts page, or
          revoke Postvia&rsquo;s access directly from your TikTok account
          settings.
        </p>

        <p className="font-medium">Threads</p>
        <p>
          Postvia integrates with Threads through OAuth. When you connect a
          Threads account, we process your Threads account ID, username, and
          OAuth credentials to publish text, image, and video posts on your
          behalf and to manage the integration. Once published, your content
          is governed by Threads/Meta&rsquo;s terms and privacy policy. You
          can disconnect your Threads account at any time from the Postvia
          Accounts page, or revoke Postvia&rsquo;s access directly from your
          Threads or Meta account settings.
        </p>

        <p className="font-medium">X (Twitter)</p>
        <p>
          Postvia integrates with X through OAuth. When you connect an X
          account, we process your X account ID, username, and OAuth
          credentials to publish text posts on your behalf and to manage the
          integration. The current X API integration may be subject to
          availability and credit limitations. Once published, your content
          is governed by X Corp.&rsquo;s terms and privacy policy. You can
          disconnect your X account at any time from the Postvia Accounts
          page, or revoke Postvia&rsquo;s access directly from your X
          account settings.
        </p>
      </LegalSection>

      <LegalSection heading="6. Service Providers and Subprocessors">
        <p>
          Postvia uses the following service providers to operate and deliver
          the service. Each provider processes data only to the extent
          necessary to provide its respective service, under its own terms
          and our agreements with them:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            <span className="font-medium">Vercel</span> &mdash; web hosting,
            serverless functions, background jobs, and scheduled publishing
            infrastructure
          </li>
          <li>
            <span className="font-medium">Vercel Blob</span> &mdash;
            private object and media storage for your uploaded images and
            videos
          </li>
          <li>
            <span className="font-medium">Neon (PostgreSQL)</span> &mdash;
            database storing account, session, post, media, and social-account
            records
          </li>
        </ul>
        <p>
          Authentication is handled through an open-source library (Better
          Auth) on our own infrastructure; no separate third-party
          authentication vendor processes your authentication data. Social
          platform APIs (Instagram/Meta, TikTok, Threads, X) act as
          independent data controllers for data you publish or that they
          process under their own terms.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data Storage and Retention">
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Your data is retained for as long as needed to provide the
            service to you.
          </li>
          <li>
            Some data may be retained for a limited period as reasonably
            necessary to comply with legal obligations, resolve disputes,
            and enforce our rights.
          </li>
          <li>
            Connected social account data (account identifiers and OAuth
            credentials) is retained until you disconnect the integration or
            delete your account.
          </li>
          <li>
            User content and post data is retained while your account exists
            and in accordance with the service&rsquo;s operational needs.
          </li>
          <li>
            We do not impose specific data-retention periods on user content
            beyond what is necessary to operate and provide the service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="8. Account Deletion and Your Controls">
        <p>
          You can delete your Postvia account at any time from{" "}
          <span className="font-medium">Settings &rarr; Delete account</span>.
          Account deletion permanently removes:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Your Postvia account and user record</li>
          <li>Sessions and authentication data</li>
          <li>Posts, drafts, and post-related data</li>
          <li>Uploaded media files from our storage</li>
          <li>Stored social account credentials and OAuth tokens</li>
        </ul>
        <p>
          Where supported, Postvia will attempt to revoke your social
          platform OAuth tokens during account deletion. You can also revoke
          Postvia&rsquo;s access directly on each connected platform at any
          time.
        </p>
        <p>
          <span className="font-medium">Important:</span> Account deletion
          only removes data under Postvia&rsquo;s control. Content you have
          already published to Instagram, TikTok, Threads, X, or other
          platforms remains on those platforms and is governed by their
          respective terms and privacy policies. You are responsible for
          removing any published content on third-party platforms that you no
          longer want published.
        </p>
        <p>
          You can also disconnect individual social accounts from the
          Accounts page and delete individual posts and their media at any
          time.
        </p>
      </LegalSection>

      <LegalSection heading="9. Disconnecting Social Accounts">
        <p>
          You can disconnect any connected social account at any time from
          the Postvia Accounts page. Disconnecting an account removes its
          stored OAuth credentials from Postvia and prevents future
          publishing to that platform through Postvia. Disconnecting an
          account does not delete content that has already been published to
          the platform.
        </p>
      </LegalSection>

      <LegalSection heading="10. Your Rights">
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
          The fastest way to exercise most of these rights is to delete your
          account directly in Settings. You can also contact us through our
          GitHub repository (github.com/ponslookspain/postvia) to request
          access, rectification, or assistance with data subject rights.
          These rights are not absolute; applicable law may permit or require
          us to retain certain data.
        </p>
      </LegalSection>

      <LegalSection heading="11. International Transfers">
        <p>
          Postvia&rsquo;s infrastructure may process and store data in
          regions outside your country. For example, application hosting
          infrastructure is located in the United States and the database is
          located in the European Union. Where required by applicable law,
          transfers rely on the standard contractual terms and safeguards
          provided by our infrastructure providers. Social platform
          integrations may also involve transferring your published content
          and associated data to the platforms&rsquo; own infrastructure in
          different regions.
        </p>
      </LegalSection>

      <LegalSection heading="12. Security">
        <p>
          We use reasonable technical and organizational measures to protect
          your data, including:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>HTTPS encryption for data in transit</li>
          <li>Passwords stored only as cryptographic hashes</li>
          <li>
            Private media storage with short-lived, authenticated access
            links
          </li>
          <li>
            Social authentication tokens stored server-side and never exposed
            to the client
          </li>
          <li>
            Minimal data collection: we collect only what is necessary for
            the features you use
          </li>
        </ul>
        <p>
          No method of transmission or storage is perfectly secure. We cannot
          guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="13. Children&rsquo;s Privacy">
        <p>
          Postvia is not directed at children under the age of 16. We do not
          knowingly collect personal data from children. If you are under the
          age of 16, do not use Postvia. If you become aware that a child
          has provided us with personal data, please contact us through our
          GitHub repository and we will take steps to delete it.
        </p>
      </LegalSection>

      <LegalSection heading="14. Changes to This Policy">
        <p>
          If this policy changes, the &ldquo;Effective date&rdquo; above is
          updated. Material changes will be pointed out in the app where
          practical. We encourage you to review this policy periodically.
        </p>
      </LegalSection>

      {/* TODO: replace with a dedicated privacy contact email once one is published */}
      <LegalSection heading="15. Contact">
        <p>
          Privacy questions and data subject requests:{" "}
          github.com/ponslookspain/postvia (open an issue or reach the
          maintainer through the repository).
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
