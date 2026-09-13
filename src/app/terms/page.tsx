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
      effectiveDate="September 12, 2026"
      currentPage="terms"
      intro="These Terms of Service govern your use of Postvia, a web-based social media management tool that lets you compose posts with text and media, preview them per platform, schedule them, and publish them to the social accounts you connect. By creating an account or using the service, you agree to these terms."
    >
      <LegalSection heading="1. Acceptance">
        <p>
          By creating an account, accessing, or using Postvia (the
          &ldquo;Service&rdquo;), you agree to be bound by these Terms of
          Service (the &ldquo;Terms&rdquo;). If you do not agree, do not use
          Postvia. If you accept these Terms on behalf of an organization,
          you represent that you have the authority to bind that
          organization.
        </p>
      </LegalSection>

      <LegalSection heading="2. Eligibility">
        <p>
          You must be at least 16 years of age and capable of forming a
          binding legal agreement to use Postvia. If you are using the
          Service on behalf of an organization, you represent that you have
          the authority to bind that organization to these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="3. Account Registration and Security">
        <p>
          You create an account with your name, email address, and a
          password (minimum 8, maximum 128 characters), or by signing in
          with your Google account. Email verification is required before
          you can use the Service: after signup you receive a verification
          email with a link that expires after 60 minutes, and you can
          request a new one from the verification page.
        </p>
        <p>
          You are responsible for keeping your credentials confidential and
          for all activity that occurs under your account. Please notify us
          promptly at{" "}
          <a
            href="mailto:hello@postvia.online"
            className="underline hover:text-foreground"
          >
            hello@postvia.online
          </a>{" "}
          if you become aware of any unauthorized use of your account.
        </p>
      </LegalSection>

      <LegalSection heading="4. Description of Postvia">
        <p>
          Postvia is a web-based social media management tool. It provides:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            A composer for creating posts with text, images, and videos
          </li>
          <li>Per-platform previews and platform-specific customization</li>
          <li>Post scheduling with date, time, and timezone selection</li>
          <li>Immediate publishing on demand</li>
          <li>
            Publishing to connected social platforms through their official
            APIs
          </li>
          <li>Draft management and publication status tracking</li>
          <li>A content calendar and bulk video scheduling, subject to plan limits</li>
          <li>Retry and rescheduling of failed posts</li>
        </ul>
        <p>
          Postvia is not affiliated with, endorsed by, or sponsored by Meta,
          Instagram, TikTok, Threads, X Corp., Google, or any other platform
          or company.
        </p>
      </LegalSection>

      <LegalSection heading="5. Social Account Connections">
        <p>
          Publishing requires connecting a social account through the
          official OAuth flow of the target platform. The platforms Postvia
          currently supports are Instagram, Threads, TikTok, and X. No other
          social platform is currently integrated, regardless of any general
          wording elsewhere in the product.
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            <span className="font-medium">Instagram</span> &mdash; via
            Instagram Login (OAuth); permissions:{" "}
            <code>instagram_business_basic</code> and{" "}
            <code>instagram_business_content_publish</code>. Publishing
            requires an Instagram Business or Creator account.
          </li>
          <li>
            <span className="font-medium">Threads</span> &mdash; via OAuth;
            permissions: <code>threads_basic</code> and{" "}
            <code>threads_content_publish</code>; text, image, and video
            publishing.
          </li>
          <li>
            <span className="font-medium">TikTok</span> &mdash; via TikTok
            Login Kit; permissions: <code>user.info.basic</code> and{" "}
            <code>video.publish</code>; video publishing through the TikTok
            Content Posting API (see section 12).
          </li>
          <li>
            <span className="font-medium">X</span> &mdash; via OAuth 2.0;
            permissions: <code>tweet.read</code>, <code>users.read</code>,{" "}
            <code>tweet.write</code>, and <code>offline.access</code>; text
            publishing only. The X integration may be subject to
            availability and API credit limitations outside our control.
          </li>
        </ul>
        <p>
          The number of accounts you may connect in total is subject to
          your plan (see section 20). You can disconnect any connected
          account at any time from the Accounts page. You are responsible
          for the social accounts you connect and for complying with each
          platform&rsquo;s terms, policies, and community guidelines.
        </p>
      </LegalSection>

      <LegalSection heading="6. OAuth Authorization">
        <p>
          Connecting a social account redirects you to that platform, where
          you review and approve the permissions listed in section 5. Only
          the permissions you approve are granted. Postvia never sees your
          platform password: authentication happens entirely on the
          platform&rsquo;s own pages, and the platform returns OAuth
          credentials that Postvia stores and uses as described in sections
          7 and 8.
        </p>
        <p>
          Signing in with Google works the same way: Google authenticates
          you and shares your basic profile (name, email address, and
          profile image) so Postvia can create or link your account. If a
          Google account uses an email address that already has a
          password-based Postvia account, the two are linked.
        </p>
      </LegalSection>

      <LegalSection heading="7. Access Tokens and Refresh Tokens">
        <p>
          The OAuth credentials that platforms issue to Postvia &mdash;
          access tokens and, where the platform provides them, refresh
          tokens &mdash; are stored server-side in our database and are
          never displayed in the app or exposed to your browser. They are
          used solely to maintain your connected integrations and to carry
          out publishing and status checks you request.
        </p>
        <p>
          Access tokens expire. Where a platform supports refreshing,
          Postvia refreshes the token automatically; where it does not, or
          when a token is revoked or becomes invalid, publishing to that
          account fails and you need to reconnect the account. Disconnecting
          an account deletes its stored credentials from Postvia and, where
          the platform offers a revocation API, Postvia asks the platform to
          revoke access on a best-effort basis.
        </p>
      </LegalSection>

      <LegalSection heading="8. Authorization to Publish">
        <p>
          By connecting a social account and requesting publication, you
          authorize Postvia to send your content to that platform&rsquo;s
          official API on your behalf. This authorization is limited to:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Creating and submitting content you have composed and requested
            to publish
          </li>
          <li>
            Scheduling content for future publication as you have requested
          </li>
          <li>
            Checking publication status, handling retries, and storing the
            platform&rsquo;s post or job identifiers for your publication
            history
          </li>
        </ul>
        <p>
          Postvia publishes only to the accounts you connected and only the
          content you submit. It does not read your platform feeds, messages,
          or analytics, and it does not post anything you did not request.
        </p>
      </LegalSection>

      <LegalSection heading="9. Immediate Publishing">
        <p>
          You can publish a post immediately from the composer or a post
          page. Immediate publishing sends your content to each selected
          platform&rsquo;s API right away, subject to availability, rate
          limits, valid credentials, and content rules. If publication to a
          platform fails, the post is marked as failed for that platform and
          you can retry it.
        </p>
      </LegalSection>

      <LegalSection heading="10. Scheduled Publishing">
        <p>
          You can save posts as drafts or schedule a post for a chosen date,
          time, and timezone. A scheduled time applies to the whole post and
          all platforms selected for it. Scheduled posts are picked up by
          background scheduling checks and published when due.
        </p>
        <p>
          Scheduling does not guarantee publication at the exact selected
          time: a scheduled post may be published slightly after the time
          you selected, and platform outages, API failures, expired tokens,
          or content restrictions may prevent or delay publication.
        </p>
      </LegalSection>

      <LegalSection heading="11. Retry, Partial Failure, and Platform Rejection">
        <p>
          Publishing to several platforms at once can succeed on some and
          fail on others. Postvia tracks each platform separately, so a post
          may end up partially published, with per-platform status and error
          messages shown on the post page. Failed platform deliveries can be
          retried or rescheduled from the post page.
        </p>
        <p>
          Platforms may reject content for their own reasons &mdash; for
          example unsupported formats, length limits, duplicate content,
          rate limits, or policy violations. Rejection happens on the
          platform&rsquo;s side; Postvia reports the platform&rsquo;s error
          but cannot override the platform&rsquo;s decision.
        </p>
      </LegalSection>

      <LegalSection heading="12. TikTok Direct Post">
        <p>
          TikTok publishing uses TikTok Login Kit and the TikTok Content
          Posting API in Direct Post mode, within the{" "}
          <code>video.publish</code> permission you approved. TikTok accepts
          video only: a TikTok delivery requires exactly one video and a
          title of up to 2,200 characters.
        </p>
        <p>
          The available privacy settings (for example public, friends-only,
          or self-only) depend on your TikTok account and are read from
          TikTok at publish time; you choose among the options TikTok
          reports for your account. Videos are uploaded in chunks and
          TikTok processes them asynchronously, so TikTok deliveries may
          take longer to finalize. Postvia keeps TikTok&rsquo;s publish
          identifier to track that processing and to resume safely without
          publishing twice.
        </p>
      </LegalSection>

      <LegalSection heading="13. Platform-Specific Limitations">
        <p>
          Each connected platform enforces its own limits, which may change
          at any time. Current examples include:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Text limits: X 280 characters, Threads 500 characters</li>
          <li>Caption/title limits: Instagram 2,200 characters, TikTok title 2,200 characters</li>
          <li>
            Media rules: Instagram accepts JPEG images and MP4 video only;
            X publishing is text-only and media attached to an X delivery
            blocks it; Threads accepts a single image or a single MP4 video
            per delivery
          </li>
          <li>Daily publishing rate limits and duplicate-content rules</li>
          <li>
            Account-type restrictions, such as Instagram&rsquo;s Business or
            Creator account requirement
          </li>
        </ul>
        <p>
          The composer shows what each selected platform accepts. It is your
          responsibility to respect the current limits and rules of each
          platform you use.
        </p>
      </LegalSection>

      <LegalSection heading="14. User Responsibility for Content">
        <p>
          Postvia is a tool for managing and publishing your content; it is
          not a content moderator. You are solely responsible for:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            All content you create, schedule, and publish through Postvia
          </li>
          <li>
            Ensuring your content complies with applicable laws and the terms
            and community guidelines of each connected social platform
          </li>
          <li>
            Understanding and respecting the rules, restrictions, and
            limitations of each platform you use
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="15. Copyright, Music, Trademarks, and Third-Party Rights">
        <p>
          You confirm that you own or have all necessary rights, permissions,
          and authorizations for any content you submit and publish through
          Postvia. This includes rights to images of identifiable people,
          music and audio, trademarks and brand names, and any other
          third-party intellectual property in your posts.
        </p>
        <p>
          Do not upload or publish content you do not have the right to use.
          Postvia does not clear rights on your behalf, and platforms may
          remove or mute content that infringes third-party rights.
        </p>
      </LegalSection>

      <LegalSection heading="16. Platform Policies">
        <p>
          Every connected platform applies its own terms of service,
          content policies, and community guidelines to content published
          through its API &mdash; including rules on spam, misleading
          content, regulated goods, and sensitive topics. You agree to comply
          with the policies of each platform you publish to. A platform may
          reject, restrict, or remove your content, or suspend your platform
          account, without notice to Postvia.
        </p>
      </LegalSection>

      <LegalSection heading="17. Media Uploads and Processing">
        <p>
          Postvia accepts images (JPEG, PNG, WebP, GIF up to 10&nbsp;MB) and
          videos (MP4, WebM, MOV up to 100&nbsp;MB), with a maximum of 4
          media files per post. To prepare uploads for publishing, Postvia
          validates file type and size and converts still images to a
          canonical JPEG form where appropriate (animated GIFs are kept
          as-is).
        </p>
        <p>
          Media is stored in private object storage. Files are served only
          to you while authenticated, and to a platform at the moment of
          publishing through short-lived, single-file links &mdash; never
          through public URLs. Uploaded files that are never attached to a
          post are removed automatically.
        </p>
      </LegalSection>

      <LegalSection heading="18. Third-Party Platform Dependency">
        <p>
          Postvia depends on third-party social platform APIs and
          infrastructure. By using Postvia, you acknowledge and agree that:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Postvia cannot guarantee that any connected platform will accept,
            publish, or continue to host your content
          </li>
          <li>
            Platform APIs may be unavailable, rate-limited, degraded,
            modified, or discontinued at any time without notice
          </li>
          <li>
            Social platforms may reject, delay, modify, restrict, or remove
            your content without notice to Postvia
          </li>
          <li>
            Postvia is not responsible for any third-party platform&rsquo;s
            actions, omissions, outages, policy changes, or content decisions
          </li>
          <li>
            Continued availability of any specific platform integration is
            not guaranteed
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="19. Service Providers">
        <p>
          Postvia is operated on the following infrastructure and services,
          which process data only as necessary to provide their function:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            <span className="font-medium">Vercel</span> &mdash; application
            hosting, serverless functions, background jobs, and scheduled
            publishing checks
          </li>
          <li>
            <span className="font-medium">Vercel Blob</span> &mdash; private
            object storage for your uploaded images and videos
          </li>
          <li>
            <span className="font-medium">Neon (PostgreSQL)</span> &mdash;
            database for accounts, sessions, posts, media records, and
            social-account credentials
          </li>
          <li>
            <span className="font-medium">Resend</span> &mdash; transactional
            email delivery for account verification
          </li>
          <li>
            <span className="font-medium">Sentry</span> &mdash; error
            monitoring and diagnostics, with personal data scrubbed before
            events leave our servers
          </li>
        </ul>
        <p>
          Authentication runs on our own infrastructure using the
          open-source Better Auth library; no third-party authentication
          vendor is involved. The social platforms themselves (Instagram and
          Threads by Meta, TikTok, X, and Google for sign-in) act
          independently under their own terms when you use their services.
        </p>
      </LegalSection>

      <LegalSection heading="20. Subscriptions and Plans">
        <p>
          Postvia offers Free, Growth, and Scale plans that differ by usage
          limits &mdash; currently the number of posts you can create per
          calendar month (Free: 15, Growth: 300, Scale: unlimited), the
          number of connected accounts in total (Free: 1, Growth: 5,
          Scale: unlimited), and access to bulk video scheduling (Growth and
          Scale, up to 10 videos per batch). New accounts start on the Free
          plan.
        </p>
        <p>
          Postvia does not currently collect payment details or process
          charges: selecting a plan only adjusts your usage limits, and no
          payment is taken. If paid billing is introduced in the future, it
          will be described separately and will apply only with your
          consent.
        </p>
      </LegalSection>

      <LegalSection heading="21. Prohibited Conduct">
        <p>You agree not to:</p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Use Postvia to publish content that is unlawful, infringing,
            hateful, harassing, defamatory, or otherwise violates a
            platform&rsquo;s terms or community guidelines
          </li>
          <li>
            Use the service to spam, manipulate, or abuse any connected
            platform or Postvia itself
          </li>
          <li>
            Attempt to gain unauthorized access to other accounts, systems,
            or APIs, or to circumvent usage limits and security measures
          </li>
          <li>
            Resell, sublicense, or provide the service to third parties as
            your own product without permission
          </li>
          <li>
            Misuse scheduling or publishing features to overload platform
            APIs or Postvia infrastructure
          </li>
          <li>
            Use the service in any way that could damage, disable,
            overburden, or impair the service or interfere with any other
            party&rsquo;s use of the service
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="22. Intellectual Property">
        <p>
          You keep all rights to the text, images, videos, and other content
          you submit to Postvia. By using the Service, you grant Postvia
          only the limited license necessary to store, host, process,
          display, and transmit your content in order to operate the Service
          and deliver your content to the platforms you select when you
          request publication.
        </p>
        <p>
          Postvia itself (including its interface, code, branding, and
          documentation) is owned by its developer. These Terms do not grant
          you any rights to use the Postvia name, logo, trademarks, or other
          intellectual property.
        </p>
      </LegalSection>

      <LegalSection heading="23. Suspension and Termination">
        <p>
          We may suspend or terminate accounts that violate these Terms,
          abuse the service, or put the service or its users at risk. You may
          stop using the service and delete your account at any time.
          Sections of these Terms that by their nature should survive
          termination (including disclaimers, limitation of liability,
          governing law, and indemnification) survive termination.
        </p>
      </LegalSection>

      <LegalSection heading="24. Account Deletion">
        <p>
          You can delete your account at any time from Settings, after
          confirming the deletion. Account deletion permanently removes your
          user record, sessions, sign-in connections, preferences, posts and
          drafts, media records and stored files, and connected social
          accounts with their stored OAuth credentials.
        </p>
        <p>
          During deletion, Postvia asks connected platforms to revoke access
          where their API offers revocation. Deleting your posts stops any
          of their still-scheduled publications. For details on content
          already published elsewhere, see section 25.
        </p>
      </LegalSection>

      <LegalSection heading="25. Already-Published Third-Party Content">
        <p>
          Content that was already published to Instagram, Threads, TikTok,
          X, or any other platform lives on that platform under that
          platform&rsquo;s control. Deleting your Postvia account,
          disconnecting an account, or deleting a post in Postvia does not
          remove already-published content from third-party platforms. To
          remove it, delete it on the platform itself. You can also revoke
          Postvia&rsquo;s access at any time directly in each
          platform&rsquo;s own account or app settings.
        </p>
      </LegalSection>

      <LegalSection heading="26. Disclaimers">
        <p>
          To the fullest extent permitted by law, the service is provided
          &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
          warranties of any kind, express or implied, including but not
          limited to warranties of merchantability, fitness for a particular
          purpose, and non-infringement. We do not warrant that the service
          will be uninterrupted, error-free, or secure, or that any
          publication, schedule, or platform integration will work as
          expected.
        </p>
      </LegalSection>

      <LegalSection heading="27. Limitation of Liability">
        <p>
          To the fullest extent permitted by law, Postvia and its developer
          shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages, or any loss of profits or
          revenues, data loss, or business interruption arising out of or
          related to your use of the service, even if advised of the
          possibility of such damages. Our total liability shall not exceed
          the greater of (a) the amount you paid to us in the twelve months
          preceding the claim, or (b) fifty US dollars ($50.00).
        </p>
      </LegalSection>

      <LegalSection heading="28. Indemnification">
        <p>
          To the extent permitted by applicable law, you agree to indemnify
          and hold harmless Postvia and its developer from and against any
          claims, liabilities, damages, losses, and expenses (including
          reasonable legal fees) arising out of or related to your use of
          the service, your content, or your violation of these Terms or the
          rights of any third party.
        </p>
      </LegalSection>

      <LegalSection heading="29. Governing Law">
        <p>
          These Terms are governed by and construed in accordance with the
          laws of the applicable jurisdiction, without regard to its
          conflict-of-laws principles. Any disputes arising from or relating
          to these Terms or the service shall be resolved in the competent
          courts of the applicable jurisdiction, unless applicable law
          requires a different forum.
        </p>
      </LegalSection>

      <LegalSection heading="30. Changes">
        <p>
          We may update these Terms. When we do, we will revise the
          &ldquo;Effective date&rdquo; at the top of this page. Material
          changes will be announced in the app where practical. Continued
          use after the effective date means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="31. Contact">
        <p>
          Questions about these Terms:{" "}
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
