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
      intro="This policy explains what personal data Postvia handles, why, where it is stored, and what choices you have. Postvia is an independent project; there is no advertising, no third-party analytics tracking in the app, and your data is never sold."
    >
      <LegalSection heading="1. Who operates Postvia">
        <p>
          Postvia is developed and operated by its creator as an independent
          project. You can reach us through the project&rsquo;s GitHub repository
          (github.com/ponslookspain/postvia).
        </p>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <p className="font-medium">Account data</p>
        <p>
          When you sign up, we store your name, email address, and a hashed
          version of your password (via the Better&nbsp;Auth library). We also
          store simple product preferences you can change in Settings.
        </p>
        <p className="font-medium">Sessions and cookies</p>
        <p>
          After you sign in, a session cookie is set in your browser so the app
          can recognize you. Session records (token, expiry time, and
          optionally the request&rsquo;s IP address and user-agent) are stored to
          manage and revoke sessions. We do not use advertising or tracking
          cookies.
        </p>
        <p className="font-medium">Connected social account data</p>
        <p>
          When you connect Threads or X through OAuth, we store the platform
          name, your public account identifier and username on that platform,
          and the OAuth access/refresh tokens (with expiry) that let us publish
          on your behalf. Tokens are kept server-side in our database and are
          never shown in the app.
        </p>
        <p className="font-medium">Posts and media</p>
        <p>
          We store the text of the posts you create, attached images or videos
          (as files in private object storage), their scheduling and publication
          status, and the identifier returned by the platform after a successful
          publish.
        </p>
      </LegalSection>

      <LegalSection heading="3. How we use your data">
        <ul className="list-disc space-y-1 pl-6">
          <li>to authenticate you and keep you signed in;</li>
          <li>
            to publish and schedule your posts to the accounts you connect, and
            to show your publication history;
          </li>
          <li>
            to display your connected account handles in the composer and
            previews;
          </li>
          <li>
            to operate, secure, and improve the service (error diagnosis, abuse
            prevention).
          </li>
        </ul>
        <p>
          We do not profile you for advertising and we do not sell or rent your
          personal data.
        </p>
      </LegalSection>

      <LegalSection heading="4. Third parties and infrastructure">
        <p>
          Publishing sends your post content to the platform you selected (Meta
          Threads API or X API); once published, that content is governed by the
          platform&rsquo;s privacy policy. The service runs on:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <span className="font-medium">Vercel</span> - web hosting, serverless
            functions, background jobs, and scheduled publishing checks;
          </li>
          <li>
            <span className="font-medium">Vercel Blob</span> - private object
            storage for your uploaded images and videos;
          </li>
          <li>
            <span className="font-medium">Neon (PostgreSQL)</span> - the database
            holding account, session, post, media, and social-token records.
          </li>
        </ul>
        <p>
          These providers process data only to run the service, under their own
          terms and our agreements with them.
        </p>
      </LegalSection>

      <LegalSection heading="5. Data retention">
        <p>
          Account, session, post, and media data is kept while your account
          exists. Deleting a post (or its media) removes the database records
          and the associated stored media files. Disconnecting a social account
          deletes its stored tokens. Deleting your account removes your data as
          described in section&nbsp;7.
        </p>
      </LegalSection>

      <LegalSection heading="6. Security">
        <p>
          The app is served over HTTPS. Passwords are stored only as
          cryptographic hashes. Media lives in private storage and is reachable
          only through short-lived, single-file links issued on demand; social
          tokens are stored server-side. No method of transmission or storage is
          perfectly secure, so we keep the data we collect to the minimum the
          feature needs.
        </p>
      </LegalSection>

      <LegalSection heading="7. Deletion and your controls">
        <p>
          You can delete individual posts and media, disconnect social accounts,
          and delete your entire account from Settings at any time. Account
          deletion removes your account, sessions, posts, stored media, and
          saved social tokens. Content already published to a platform remains on
          that platform until you delete it there. You can also revoke Postvia&rsquo;s
          access from your Threads or X account settings.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your rights">
        <p>
          Where applicable law provides them, you can request access to your
          data, correction of inaccurate data, export, or erasure. Contact us
          via the GitHub repository and we will respond; deleting your account
          is usually the fastest path to erasure. The service is not directed at
          children under 16, and we do not knowingly collect their data.
        </p>
      </LegalSection>

      <LegalSection heading="9. International transfers">
        <p>
          Our infrastructure may process and store data in data centers in
          different regions (for example, application hosting in the United
          States and the database in the European Union). Where required, these
          transfers rely on the standard terms and safeguards of the providers
          listed above.
        </p>
      </LegalSection>

      <LegalSection heading="10. Changes to this policy">
        <p>
          If this policy changes, the &ldquo;Effective date&rdquo; above is
          updated. Material changes will be pointed out in the app where
          practical.
        </p>
      </LegalSection>

      <LegalSection heading="11. Contact">
        <p>
          Privacy questions: github.com/ponslookspain/postvia (open an issue or
          reach the maintainer through the repository).
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
