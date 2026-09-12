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
      currentPage="terms"
      intro="These Terms of Service govern your use of Postvia, a web-based social media management tool that lets you compose posts with text and media, preview them per platform, schedule them, and publish them to the social accounts you connect. By creating an account or using the service, you agree to these terms."
    >
      <LegalSection heading="1. Acceptance of Terms">
        <p>
          By creating an account, accessing, or using Postvia, you agree to
          be bound by these Terms of Service. If you do not agree, do not
          use Postvia.
        </p>
      </LegalSection>

      <LegalSection heading="2. Eligibility">
        <p>
          You must be at least 16 years of age and capable of forming a
          binding legal agreement to use Postvia. If you are using the
          service on behalf of an organization, you represent that you have
          the authority to bind that organization to these Terms.
        </p>
      </LegalSection>

      <LegalSection heading="3. Account Registration and Security">
        <p>
          You create an account with your name, email address, and a
          password (minimum 8 characters). You are responsible for keeping
          your credentials confidential and for all activity that occurs
          under your account. Please notify us promptly if you become aware
          of any unauthorized use of your account.
        </p>
      </LegalSection>

      <LegalSection heading="4. What Postvia Is">
        <p>
          Postvia is a web-based social media management tool. It provides:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            A composer for creating posts with text, images, and videos
          </li>
          <li>Per-platform previews and platform-specific customization</li>
          <li>Post scheduling with date, time, and timezone selection</li>
          <li>
            Publishing to connected social platforms through their official
            APIs
          </li>
          <li>
            Draft management and publication status tracking
          </li>
        </ul>
        <p>
          Postvia is not affiliated with, endorsed by, or sponsored by Meta,
          Instagram, TikTok, Threads, X Corp., or any other social platform.
        </p>
      </LegalSection>

      <LegalSection heading="5. Connecting Your Social Accounts">
        <p>
          Publishing requires connecting a social account through the
          official OAuth flow of the target platform. When you connect an
          account, the platform grants Postvia access tokens with the
          permissions you approve &mdash; such as reading your basic profile
          and publishing on your behalf. Currently supported platforms and
          their requested permissions include:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            <span className="font-medium">Instagram</span> &mdash; via
            Instagram Login; permissions: instagram_business_basic,
            instagram_business_content_publish
          </li>
          <li>
            <span className="font-medium">TikTok</span> &mdash; via TikTok
            Login Kit; Content Posting API for direct video publishing
          </li>
          <li>
            <span className="font-medium">Threads</span> &mdash; via OAuth;
            text, image, and video publishing
          </li>
          <li>
            <span className="font-medium">X</span> &mdash; via OAuth; text
            publishing (the current X API integration may be subject to
            availability and credit limitations)
          </li>
        </ul>
        <p>
          You can disconnect any connected account at any time from the
          Accounts page, which deletes the stored credentials from Postvia.
          You are responsible for the social accounts you connect and for
          complying with each platform&rsquo;s terms, policies, and community
          guidelines.
        </p>
      </LegalSection>

      <LegalSection heading="6. Authorization to Publish">
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
            Monitoring publication status and handling retries where
            appropriate
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="7. Your Content">
        <p>
          You keep all rights to the text, images, videos, and other content
          you submit to Postvia. By using the service, you grant Postvia
          only the limited license necessary to:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>
            Store, host, process, display, and transmit your content to
            provide and operate the service
          </li>
          <li>
            Deliver your content to the platforms you select, when you
            request publication
          </li>
          <li>
            Process, validate, optimize, compress, resize, convert, store,
            retrieve, and deliver your content as reasonably necessary to
            provide and improve the Service
          </li>
        </ul>
        <p>
          You confirm that you own or have all necessary rights, permissions,
          and authorizations for any content you submit and publish through
          Postvia.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your Responsibility for Content">
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
            Obtaining any necessary rights, consents, or permissions for
            content you publish (including rights to images of people, music,
            trademarks, and any third-party intellectual property)
          </li>
          <li>
            Understanding and respecting the rules, restrictions, and
            limitations of each platform you use
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="9. Creating, Scheduling, and Publishing Posts">
        <p>
          You can save posts as drafts, schedule a post for a chosen date and
          time, or publish immediately. A scheduled time applies to the whole
          post and all platforms selected for it. Publishing works by sending
          your post content to the connected platforms&rsquo; official APIs.
        </p>
        <p>
          Scheduling depends on background scheduling checks and platform API
          availability, so a scheduled post may be published slightly after
          the time you selected. Scheduling does not guarantee publication;
          platform outages, API failures, token expiry, or content
          restrictions may prevent or delay publication.
        </p>
        <p>
          Publishing may fail &mdash; for example, when a platform API is
          unavailable, your access token expires, or a platform rejects the
          content. Failed posts can be retried from the post page.
        </p>
      </LegalSection>

      <LegalSection heading="10. Platform-Specific Limits and Restrictions">
        <p>
          Each connected platform has its own rules, limits, and
          restrictions, which may change at any time. Examples include:
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-6">
          <li>Character and caption length limits</li>
          <li>Supported media types and file sizes</li>
          <li>Daily publishing rate limits</li>
          <li>
            Content policies, community guidelines, and prohibited content
            rules
          </li>
          <li>Geographic or account-type restrictions</li>
        </ul>
        <p>
          It is your responsibility to understand and comply with the current
          limits and rules of each platform you use.
        </p>
      </LegalSection>

      <LegalSection heading="11. Third-Party Platform Dependency">
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

      <LegalSection heading="12. Media Uploads">
        <p>
          Postvia accepts images (JPG, PNG, WebP, GIF up to 10&nbsp;MB) and
          videos (MP4, WebM up to 100&nbsp;MB), with a maximum of 4 media
          files per post. Media is stored in private object storage and is
          only served to you (authenticated) and to a platform at the moment
          of publishing through short-lived, single-file links.
        </p>
        <p>
          Supported media types differ per platform; the composer shows what
          each platform accepts. For example, Instagram currently accepts
          only JPEG images and MP4 video, while Threads accepts additional
          image formats. X media publishing is not currently available.
        </p>
      </LegalSection>

      <LegalSection heading="13. Service Availability and Changes">
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, without any uptime guarantee or service-level
          commitment. Features may be added or removed, and the service may
          be modified, suspended, or discontinued at any time. We may change
          infrastructure, providers, or technical architecture as needed.
        </p>
        <p>
          The service is currently offered free of charge. If paid plans or
          features are introduced, they will be described and billed only
          after you consent.
        </p>
      </LegalSection>

      <LegalSection heading="14. Prohibited Conduct">
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

      <LegalSection heading="15. Intellectual Property">
        <p>
          Postvia (including its interface, code, branding, and
          documentation) is owned by its developer. These Terms do not grant
          you any rights to use the Postvia name, logo, trademarks, or
          intellectual property.
        </p>
      </LegalSection>

      <LegalSection heading="16. Suspension and Termination">
        <p>
          We may suspend or terminate accounts that violate these Terms, abuse
          the service, or put the service or its users at risk. You may stop
          using the service and delete your account at any time. Sections of
          these Terms that by their nature should survive termination
          (including disclaimers, limitation of liability, governing law, and
          indemnification) survive termination.
        </p>
      </LegalSection>

      <LegalSection heading="17. Account Deletion">
        <p>
          You can delete your account at any time from Settings. Account
          deletion permanently removes your account, sessions, stored posts,
          media files, and saved social account tokens. Where supported,
          Postvia will attempt to revoke your social platform OAuth tokens
          during deletion. Publishing posts that were already scheduled
          stops. Content already published to third-party platforms stays
          there until you remove it on that platform. You may also revoke
          Postvia&rsquo;s access directly on each connected platform.
        </p>
      </LegalSection>

      <LegalSection heading="18. Disclaimers">
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

      <LegalSection heading="19. Limitation of Liability">
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

      <LegalSection heading="20. Indemnification">
        <p>
          To the extent permitted by applicable law, you agree to indemnify
          and hold harmless Postvia and its developer from and against any
          claims, liabilities, damages, losses, and expenses (including
          reasonable legal fees) arising out of or related to your use of
          the service, your content, or your violation of these Terms or the
          rights of any third party.
        </p>
      </LegalSection>

      <LegalSection heading="21. Governing Law and Jurisdiction">
        <p>
          These Terms are governed by and construed in accordance with the
          laws of the applicable jurisdiction, without regard to its
          conflict-of-laws principles. Any disputes arising from or relating
          to these Terms or the service shall be resolved in the competent
          courts of the applicable jurisdiction, unless applicable law
          requires a different forum.
        </p>
      </LegalSection>

      <LegalSection heading="22. Changes to These Terms">
        <p>
          We may update these Terms. When we do, we will revise the
          &ldquo;Effective date&rdquo; at the top of this page. Material
          changes will be announced in the app where practical. Continued
          use after the effective date means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection heading="23. Contact">
        <p>
          Questions about these Terms can be sent through the project&rsquo;s
          GitHub repository: github.com/ponslookspain/postvia
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
