# Graph Report - postvia  (2026-09-18)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2949 nodes · 8254 edges · 149 communities (121 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 49 edges (avg confidence: 0.84)
- Token cost: 155,794 input · 14,534 output

## Graph Freshness
- Built from commit: `38fce077`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App Shell & Navigation
- Dashboard Filters & Insights
- Auth & Onboarding UI
- Channel Feed Components
- TikTok Publishing Integration
- Debug & Test Utilities
- Auth Identity & Abuse Backend
- Platform Account API Routes
- Instagram Publishing Integration
- Marketing Landing Pages
- Error & Loading Boundaries
- Calendar Scheduling UI
- Account Backend & Migrations
- Post Composer UI
- Platform Capabilities Registry
- X Media Upload Integration
- Billing Entitlements & Gating
- Bulk Post Scheduler
- Email Verification & Abuse Gate
- Multi-Platform Publish Dispatch
- Abuse Detection System
- Core Package Dependencies
- OTP E2E Test Scenarios
- Account & Media Deletion API
- Threads Publishing Integration
- OAuth Callback Handlers
- Auth & Billing Pages
- Composer Preview Validation
- Abuse Signal Testing
- Post Creation Quota API
- Marketing Homepage
- Media File Signature Detection
- Navbar & Drawer UI
- Media Upload Authorization
- Post Composer Publish Logic
- Free Tier Quota Kernel
- Dialog & Preview Components
- Blob Storage Auth
- Banner UI Component
- Package Manifest Config
- Email Client Service
- Scheduled Publish Cron Job
- Media Registration Polling
- CSS & Font Build Tooling
- OAuth Connect & PKCE
- Idempotent Post Creation
- Video File Validation
- Social Token Encryption
- Dashboard Analytics
- Status Tabs UI Component
- Sentry Error Monitoring
- Cron Publish & Data Retention
- Calendar View Logic
- Platform Provider Dispatch
- NPM Scripts Config
- Cron Scheduling Tests
- TikTok Media Bridge
- Platform Preview Components
- Empty State UI Components
- TypeScript Config
- CLI Admin Scripts
- Rate Limit Security Tests
- Marketing Feature Pages
- Post Reschedule Logic
- Marketing Product Visuals
- Media Type Validation Config
- Billing Lifecycle Tests
- Billing Admin Override API
- Stripe Config & Tests
- Site Routing & SEO Config
- Stripe Subscription Sync
- Media Registration Concurrency Tests
- Post Detail Page Actions
- Switch UI Component
- Environment Variable Validation
- App Shell Sidebar
- Design System TS Config
- Legal Pages & Next Config
- Root Layout & Theming
- Stripe Webhook Handler
- Orphan Media Cleanup Sweep
- Database Schema & Indexes
- Stripe Checkout Flow
- Billing Section UI
- Input UI Component
- Toast Notification UI
- Dev Dependencies Config
- Account Connection Management
- OAuth Redirect Origin Validation
- Instagram Integration Tests
- TikTok Integration Tests
- Calendar Component Design
- Collapsible Navigation UI
- Radio Group UI Component
- Marketing Features Data
- TikTok Photo Publish Tests
- X Integration Tests
- Billing Concurrency Tests
- Avatar UI Component
- Badge UI Component
- Checkbox Component Stories
- Input Component Stories
- Page Container Previews
- Platform Icon Previews
- Radio Group Component
- Sidebar Menu Skeleton
- Switch Component Stories
- Tabs Component Stories
- Abuse Concurrency Testing
- Account Settings Client
- Alert Component Stories
- Label Component Stories
- Page Header Previews
- Progress Component Stories
- Section Header Component
- Skeleton Loading States
- Spinner Component Stories
- Status Badge Previews
- Status Dot Component
- TextArea Component Stories
- Media Image Optimization
- Banner Component Stories
- Divider Component Stories
- Empty State Component
- Empty Block Component
- Error Block Component
- Page Sections Layout
- Section Preview Layouts
- TikTok Media Bridge Route
- Rate Limiting Middleware
- Component Docs Generator
- ESLint Configuration
- Graphify Plugin
- Test User Cleanup Script
- Admin Billing Panel
- Abuse Event Migration
- OpenCode MCP Config
- Post Idempotency Migration
- PostCSS Configuration
- Vercel Crons Config
- Subscription Data Model
- User Data Model

## God Nodes (most connected - your core abstractions)
1. `cn()` - 223 edges
2. `reportError()` - 90 edges
3. `lucide-react` - 86 edges
4. `getApiUser()` - 71 edges
5. `react` - 70 edges
6. `prisma` - 58 edges
7. `Button()` - 54 edges
8. `NewPostComposer()` - 46 edges
9. `gateWriteRequest()` - 41 edges
10. `getEffectivePlan()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `photoModel()` --calls--> `buildComposerPreviewModel()`  [EXTRACTED]
  tests/tiktok-customization.test.ts → src/lib/composer-previews.ts
- `handleResendVerification()` --indirect_call--> `email()`  [INFERRED]
  src/app/login/LoginForm.tsx → scripts/e2e-otp-check.ts
- `handleSubmit()` --indirect_call--> `email()`  [INFERRED]
  src/app/login/LoginForm.tsx → scripts/e2e-otp-check.ts
- `handleResend()` --indirect_call--> `email()`  [INFERRED]
  src/app/verify-email/ResendVerificationForm.tsx → scripts/e2e-otp-check.ts
- `enforced()` --calls--> `resolveEffectiveFromRows()`  [EXTRACTED]
  tests/entitlements.test.ts → src/lib/entitlements.ts

## Import Cycles
- None detected.

## Communities (149 total, 28 thin omitted)

### Community 0 - "App Shell & Navigation"
Cohesion: 0.03
Nodes (123): @radix-ui/react-collapsible, @radix-ui/react-dropdown-menu, @radix-ui/react-tooltip, OnboardingForm(), FaqItem(), Breadcrumbs(), MobileTopBar(), accountMenuItems (+115 more)

### Community 1 - "Dashboard Filters & Insights"
Cohesion: 0.05
Nodes (73): @radix-ui/react-select, ChannelRow, DashboardPostFilter(), push(), STATUS_OPTIONS, InsightList(), OutcomeDonut(), OutcomeSegment (+65 more)

### Community 2 - "Auth & Onboarding UI"
Cohesion: 0.08
Nodes (56): ref_better_auth_client_plugins, ref_better_auth_react, ref_next_navigation, PendingDisconnect, PlatformAccount, PlatformConfig, PLATFORMS, TiktokTargetSettings() (+48 more)

### Community 3 - "Channel Feed Components"
Cohesion: 0.06
Nodes (53): lucide-react, ref_next_link, @radix-ui/react-avatar, Channels(), NextUp(), FeedPost, ChannelStrip(), platformName() (+45 more)

### Community 4 - "TikTok Publishing Integration"
Cohesion: 0.06
Nodes (52): GET(), resumeTiktokTarget(), buildTiktokPhotoInitPayload(), ByteRange, ensureFreshTiktokToken(), fetchTiktokPublishStatus(), getTiktokAuthorizeUrl(), getTiktokCredentials() (+44 more)

### Community 5 - "Debug & Test Utilities"
Cohesion: 0.05
Nodes (26): ref_node_assert_strict, ref_node_test, debugEnabled(), isOtpDebugEnabled(), POST(), PlanChangeStore, applyPostDeleted(), handleDeleted() (+18 more)

### Community 6 - "Auth Identity & Abuse Backend"
Cohesion: 0.07
Nodes (47): ref_better_auth_next_js, main(), GET, POST, canonicalizeEmail(), checkSocialLink(), claimIdentityFree(), DEVICE_COOKIE_NAME (+39 more)

### Community 7 - "Platform Account API Routes"
Cohesion: 0.10
Nodes (37): ref_next_headers, ref_next_server, @vercel/functions, DELETE(), DELETE(), DELETE(), DELETE(), POST() (+29 more)

### Community 8 - "Instagram Publishing Integration"
Cohesion: 0.08
Nodes (37): Post, MediaKind, resumeInstagramTarget(), checkError(), createInstagramContainer(), exchangeInstagramCode(), fetchInstagramContainerStatus(), getInstagramAuthorizeUrl() (+29 more)

### Community 9 - "Marketing Landing Pages"
Cohesion: 0.12
Nodes (31): FAQS, metadata, STEPS, FAQS, metadata, PublishingPage(), FAQS, metadata (+23 more)

### Community 10 - "Error & Loading Boundaries"
Cohesion: 0.11
Nodes (19): @radix-ui/react-slot, react, @sentry/nextjs, MediaGrid(), dynamic, STATUS_FILTERS, PostListItem, PageContainer() (+11 more)

### Community 11 - "Calendar Scheduling UI"
Cohesion: 0.07
Nodes (30): ref_base_ui_react_toast, @radix-ui/react-label, DayOverflow(), DayPostChip(), postTime(), WEEKDAYS, ScheduleDatePicker(), PageHeader() (+22 more)

### Community 12 - "Account Backend & Migrations"
Cohesion: 0.09
Nodes (31): APPLY, Row, AccountsPage(), dynamic, GET(), POST(), dynamic, CalendarPage() (+23 more)

### Community 13 - "Post Composer UI"
Cohesion: 0.07
Nodes (38): ref_next_dynamic, ChannelCustomizer(), ComposerCard(), MobileComposerBar(), ScheduleDialog(), PublishResult, addFiles(), nextMediaKey() (+30 more)

### Community 14 - "Platform Capabilities Registry"
Cohesion: 0.08
Nodes (35): TIKTOK_PHOTO_DESCRIPTION_LIMIT, TIKTOK_PHOTO_TITLE_LIMIT, CapabilityField, CapabilityFieldType, getPlatformCapabilities(), PlatformCapabilities, REGISTRY, THREADS (+27 more)

### Community 15 - "X Media Upload Integration"
Cohesion: 0.09
Nodes (35): appendXMediaChunk(), decideXStaleAttempt(), fetchXMediaProcessingStatus(), finalizeXMediaUpload(), getBasicAuthHeader(), getClientId(), getClientSecret(), getRedirectUri() (+27 more)

### Community 16 - "Billing Entitlements & Gating"
Cohesion: 0.08
Nodes (33): Allowance, applyPeriodRules(), assertCanConnectAccount(), buildBillingView(), BulkBatchGate, canBulkSchedule(), canConnectAccount(), canCreatePost() (+25 more)

### Community 17 - "Bulk Post Scheduler"
Cohesion: 0.09
Nodes (34): BulkScheduler(), addFiles(), appendFiles(), confirmPendingDupes(), getBatchId(), handleRun(), patchItem(), processItem() (+26 more)

### Community 18 - "Email Verification & Abuse Gate"
Cohesion: 0.14
Nodes (31): POST(), POST(), POST(), resolveVerificationCallbackURL(), checkAbuseRate(), dayKey(), emailDomain(), gateOAuthCallback() (+23 more)

### Community 19 - "Multi-Platform Publish Dispatch"
Cohesion: 0.11
Nodes (34): validateTargetMedia(), getDispatchEntry(), AggregatePostStatus, chooseThreadsMedia(), derivePostStatus(), executeInstagramTarget(), executeTargetPublish(), executeThreadsTarget() (+26 more)

### Community 20 - "Abuse Detection System"
Cohesion: 0.07
Nodes (32): ABUSE_RISK_RANK, AbuseDbClient, checkAbuseRateDetailed(), DISPOSABLE_EMAIL_DOMAINS, FreeClaim, FreeGateResult, getRateBucketResetAt(), HIGH_USER_COUNT (+24 more)

### Community 21 - "Core Package Dependencies"
Cohesion: 0.06
Nodes (35): dependencies, @base-ui/react, better-auth, class-variance-authority, clsx, date-fns, lucide-react, next (+27 more)

### Community 22 - "OTP E2E Test Scenarios"
Cohesion: 0.16
Nodes (29): check(), debugOtp(), email(), Jar, json(), main(), prismaCountUsers(), scenarioA() (+21 more)

### Community 23 - "Account & Media Deletion API"
Cohesion: 0.11
Nodes (25): DELETE(), GET(), DELETE(), findOwnedPost(), GET(), PATCH(), DELETE(), deleteBlobs() (+17 more)

### Community 24 - "Threads Publishing Integration"
Cohesion: 0.09
Nodes (29): createThreadsContainer(), fetchThreadsContainerStatus(), formatMetaError(), getAppId(), getAppSecret(), getRedirectUri(), IMAGE_POLL_BUDGET, logMetaError() (+21 more)

### Community 25 - "OAuth Callback Handlers"
Cohesion: 0.17
Nodes (28): clearState(), GET(), GET(), GET(), KNOWN_OAUTH_ERRORS, safeOAuthError(), timingSafeEqual(), GET() (+20 more)

### Community 26 - "Auth & Billing Pages"
Cohesion: 0.11
Nodes (25): ref_better_auth_adapters_prisma, ref_better_auth_plugins_email_otp, BillingPage(), BillingSearchParams, dynamic, dynamic, LoginPage(), dynamic (+17 more)

### Community 27 - "Composer Preview Validation"
Cohesion: 0.11
Nodes (28): PreviewAccordionItem(), PreviewCard(), buildComposerMediaErrors(), buildComposerPreviewModel(), buildComposerPreviews(), classifyMediaIssue(), ComposerPreview, countCharacters() (+20 more)

### Community 28 - "Abuse Signal Testing"
Cohesion: 0.09
Nodes (24): isFailClosedAbuseError(), isPepperMissingError(), maxRisk(), SignalInput, TOMBSTONE_EMAIL_TTL_MS, TOMBSTONE_SOCIAL_TTL_MS, getPlan(), SocialAccountData (+16 more)

### Community 29 - "Post Creation Quota API"
Cohesion: 0.14
Nodes (26): findOwnPostByOperationId(), GET(), POST(), isAbuseEnforcementEnabled(), checkBulkBatch(), claimMonthlyQuota(), createWithMonthlyQuota(), getMonthStart() (+18 more)

### Community 30 - "Marketing Homepage"
Cohesion: 0.11
Nodes (23): metadata, CalendarBulk(), Faq(), faqs, FinalCta(), Footer(), Hero(), HomeFeatures() (+15 more)

### Community 31 - "Media File Signature Detection"
Cohesion: 0.11
Nodes (27): asciiAt(), detectSignatureKind(), hasSignatureCheck(), isGif(), isIsoBaseMedia(), isJpeg(), isMatroska(), isPng() (+19 more)

### Community 32 - "Navbar & Drawer UI"
Cohesion: 0.09
Nodes (22): vaul, Navbar(), backdropVariants, Drawer(), DrawerBody(), DrawerClose(), DrawerCloseProps, DrawerContent() (+14 more)

### Community 33 - "Media Upload Authorization"
Cohesion: 0.13
Nodes (22): maxDuration, POST(), sanitizeFilename(), authorizeMediaUpload(), buildReservedPathnameRegex(), buildUploadTokenPayload(), CLIENT_UPLOAD_TTL_MS, ClientPayloadResult (+14 more)

### Community 34 - "Post Composer Publish Logic"
Cohesion: 0.13
Nodes (21): useTikTokCreatorInfo(), resetForAccount(), NewPostComposer(), buildPostBody(), clearTargetOverride(), getOperationId(), handlePublish(), handleSaveDraft() (+13 more)

### Community 35 - "Free Tier Quota Kernel"
Cohesion: 0.12
Nodes (21): AbuseStores, initFreeUsageWithClient(), isRaceConflictError(), isSerializationConflictError(), linkUserWithClient(), mergeIdentitiesWithClient(), prismaCode(), rateTakeWithClient() (+13 more)

### Community 37 - "Blob Storage Auth"
Cohesion: 0.18
Nodes (25): BlobAuthStatus, BlobHead, buildGetPresignOptions(), CanonicalImageResult, createPutSignedToken(), createSignedGetUrl(), describeBlobAuth(), describeMediaUploadConfig() (+17 more)

### Community 38 - "Banner UI Component"
Cohesion: 0.09
Nodes (21): class-variance-authority, @radix-ui/react-checkbox, Banner(), BannerContent(), BannerContentProps, BannerDescription(), BannerDescriptionProps, BannerIcon() (+13 more)

### Community 39 - "Package Manifest Config"
Cohesion: 0.08
Nodes (24): name, private, version, @base-ui/react, better-auth, clsx, eslint, eslint-config-next (+16 more)

### Community 40 - "Email Client Service"
Cohesion: 0.17
Nodes (21): EmailClient, EmailNotConfiguredError, EnvLike, escapeHtml(), getEmailFrom(), getEmailReplyTo(), getResend(), isEmailConfigured() (+13 more)

### Community 41 - "Scheduled Publish Cron Job"
Cohesion: 0.12
Nodes (21): isPublishableTargetStatus(), selectPublishableTargetIds(), claimAndPublishPost(), CRON_TICK_BUDGET_MS, CRON_TICK_BUDGET_RATIO, cronTickBudgetMs(), functionMaxDurationMs(), HOBBY_FUNCTION_MAX_DURATION_MS (+13 more)

### Community 42 - "Media Registration Polling"
Cohesion: 0.13
Nodes (17): ref_vercel_blob_client, PublishCard(), uploadFileToPost(), MEDIA_REGISTER_POLL_MS, MEDIA_REGISTER_TIMEOUT_MS, waitForMediaRegistration(), formatElapsed(), PollPostResult (+9 more)

### Community 43 - "CSS & Font Build Tooling"
Cohesion: 0.10
Nodes (15): css, copied, css, faces, families, rules, src, ref_node_fs (+7 more)

### Community 44 - "OAuth Connect & PKCE"
Cohesion: 0.21
Nodes (14): ref_crypto, GET(), GET(), GET(), GET(), applyDeviceCookie(), gateOAuthInit(), isInstagramConfigured() (+6 more)

### Community 45 - "Idempotent Post Creation"
Cohesion: 0.14
Nodes (17): bulkItemOperationId(), createSingleFlight(), IDEMPOTENCY_KEY_HEADER, isValidBulkOperationId(), isValidOperationId(), normalizeOperationId(), IdempotentCreateDeps, IdempotentCreateResult (+9 more)

### Community 46 - "Video File Validation"
Cohesion: 0.16
Nodes (19): verifyStoredVideo(), checkVideoDuration(), findBox(), isBoxType(), isIsoBaseMediaMime(), maxVideoDurationSeconds(), probeIsoBaseMediaDuration(), readMvhdDuration() (+11 more)

### Community 47 - "Social Token Encryption"
Cohesion: 0.21
Nodes (19): main(), ensureFreshInstagramToken(), decryptAccountTokens(), decryptNullableToken(), decryptToken(), deriveKey(), encryptNullableToken(), encryptRotatedTokens() (+11 more)

### Community 48 - "Dashboard Analytics"
Cohesion: 0.15
Nodes (18): date-fns, ActivityChart(), DashboardPage(), greetingFor(), ActivityStatusBucket, bucketActivityStatus(), bucketWeeks(), buildInsights() (+10 more)

### Community 49 - "Status Tabs UI Component"
Cohesion: 0.13
Nodes (19): @radix-ui/react-tabs, STATUS_FILTERS, statusHref(), StatusTabs(), Tabs(), TabsContent(), TabsContentProps, TabsList() (+11 more)

### Community 50 - "Sentry Error Monitoring"
Cohesion: 0.20
Nodes (15): onRequestError(), register(), getSentryTracesSampleRate(), isSensitiveKey(), isSentryConfigured(), pathDigest(), scrubSentryEvent(), scrubUrl() (+7 more)

### Community 51 - "Cron Publish & Data Retention"
Cohesion: 0.20
Nodes (17): handleCron(), handlers, maxDuration, listMediaBlobs(), executePublish(), resumeJobTarget(), ABUSE_EVENT_RETENTION_MS, liveRateBucketSweep (+9 more)

### Community 52 - "Calendar View Logic"
Cohesion: 0.19
Nodes (18): CalendarView(), dropOnDay(), subscribeViewerTimeZone(), useViewerTimeZone(), addMonths(), bucketCalendarPosts(), CALENDAR_STATUSES, CalendarPost (+10 more)

### Community 53 - "Platform Provider Dispatch"
Cohesion: 0.13
Nodes (11): getImplementedPlatforms(), EffectiveTargetContent, PlatformDispatch, UnknownPlatformError, PLATFORM_DISPATCH, PublishAccount, PublishOutcome, PublishPost (+3 more)

### Community 54 - "NPM Scripts Config"
Cohesion: 0.10
Nodes (20): scripts, backfill:token-encryption, build, check:schema-drift, cleanup:test-users, cleanup:test-users:check, db:generate, db:push (+12 more)

### Community 55 - "Cron Scheduling Tests"
Cohesion: 0.15
Nodes (16): GET(), POST(), isCronAuthorized(), withCron(), createFakeDb(), dateValue(), dueBacklog(), dueBatch() (+8 more)

### Community 56 - "TikTok Media Bridge"
Cohesion: 0.20
Nodes (17): resolveBaseURL(), BridgeBlobBytes, BridgeMediaRow, BridgeServeDeps, BridgeServeResult, BridgeTokenVerification, createTiktokMediaUrl(), getBridgeSecret() (+9 more)

### Community 57 - "Platform Preview Components"
Cohesion: 0.25
Nodes (13): @prisma/client, InstagramPreview(), PlatformPost(), PostAvatar(), PostMedia(), PreviewMediaSource, ThreadsPreview(), humanizePrivacy() (+5 more)

### Community 58 - "Empty State UI Components"
Cohesion: 0.14
Nodes (17): PreviewRail(), RailItem, Empty(), EmptyAction(), EmptyActionProps, EmptyContent(), EmptyContentProps, EmptyDescription() (+9 more)

### Community 59 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 60 - "CLI Admin Scripts"
Cohesion: 0.18
Nodes (14): ref_node_child_process, ref_node_process, ref_node_readline_promises, @vercel/blob, accessCheckBlob(), CliResult, countTable(), deleteBlobsCli() (+6 more)

### Community 61 - "Rate Limit Security Tests"
Cohesion: 0.12
Nodes (11): ref_node_url, WRITE_LIMIT_ACCOUNT_DELETE, WRITE_LIMIT_CREATOR_INFO, WRITE_LIMIT_MEDIA_STATUS, WRITE_LIMIT_MEDIA_UPLOAD, WRITE_LIMIT_POSTS_WRITE, OTP_SEND_IP_MAX_PER_HOUR, OTP_VERIFY_IP_MAX_PER_WINDOW (+3 more)

### Community 62 - "Marketing Feature Pages"
Cohesion: 0.26
Nodes (15): BulkPage(), FeaturesPage(), PreviewsPage(), InstagramPage(), ThreadsPage(), TiktokPage(), CalendarPage(), FAQS (+7 more)

### Community 63 - "Post Reschedule Logic"
Cohesion: 0.18
Nodes (14): openReschedule(), localDateInputValue(), localTimeInputValue(), pad(), RESCHEDULABLE_STATUSES, RescheduleResult, resolveScheduledAtUpdate(), ScheduledAtValidation (+6 more)

### Community 64 - "Marketing Product Visuals"
Cohesion: 0.14
Nodes (11): HowItWorks(), steps, accountRows, AccountsVisual(), CalendarVisual(), Chip, ComposerVisual(), Day (+3 more)

### Community 65 - "Media Type Validation Config"
Cohesion: 0.21
Nodes (15): detectMediaKind(), formatMaxMegabytes(), isMediaKind(), makeBlobPathname(), MEDIA_KIND_META, MEDIA_KINDS, MEDIA_LIMITS, MediaKindMeta (+7 more)

### Community 66 - "Billing Lifecycle Tests"
Cohesion: 0.12
Nodes (11): InvoiceSnapshot, LIVE_STRIPE_SUBSCRIPTION_STATUSES, processInvoiceSnapshot(), processWebhookEvent(), StoredSubscription, SubscriptionSnapshot, SubscriptionWrite, FUTURE (+3 more)

### Community 67 - "Billing Admin Override API"
Cohesion: 0.23
Nodes (14): DELETE(), forbidden(), GET(), POST(), requireAdmin(), VALID_MODES, VALID_STATUSES, handlePlanChange() (+6 more)

### Community 68 - "Stripe Config & Tests"
Cohesion: 0.13
Nodes (9): PortalDeps, getStripeKeyMode(), getStripePrices(), resolveStripeConfig(), STRIPE_PRICE_GROWTH_DEFAULT, STRIPE_PRICE_SCALE_DEFAULT, CheckoutCalls, savedEnv (+1 more)

### Community 69 - "Site Routing & SEO Config"
Cohesion: 0.17
Nodes (11): HomePage(), PricingPage(), MarketingRoute, organizationSchema(), PRIVATE_ROUTE_PREFIXES, PUBLIC_ROUTES, SITE_LOCALE, SITE_NAME (+3 more)

### Community 70 - "Stripe Subscription Sync"
Cohesion: 0.22
Nodes (14): DbSubStatus, applyLiveSnapshot(), cancelStripeSubscriptionNow(), isStaleDelivery(), mapSubscriptionStatus(), priceIdToPlanId(), processSubscriptionSnapshot(), reconcileSubscriptionFromStripe() (+6 more)

### Community 71 - "Media Registration Concurrency Tests"
Cohesion: 0.14
Nodes (10): MAX_MEDIA_PER_POST, claimMediaSlot(), liveMediaRegistrationStore, MediaRegistrationStore, MediaRegistrationTx, stored(), Row, createUserWithPost() (+2 more)

### Community 72 - "Post Detail Page Actions"
Cohesion: 0.19
Nodes (15): pollUntilSettled(), PostDetailPage(), handleDelete(), handleDeleteMedia(), handlePublish(), handleRescheduleSave(), handleRetry(), handleSave() (+7 more)

### Community 73 - "Switch UI Component"
Cohesion: 0.19
Nodes (13): @radix-ui/react-switch, Switch(), SwitchContext, SwitchContextType, SwitchIndicator(), SwitchIndicatorProps, switchIndicatorVariants, SwitchProps (+5 more)

### Community 74 - "Environment Variable Validation"
Cohesion: 0.14
Nodes (13): BOOT_DEFAULT, bootArg, documented, envRefs, examplePath, missingBoot, missingDocs, missingRecommended (+5 more)

### Community 75 - "App Shell Sidebar"
Cohesion: 0.15
Nodes (4): collapsedHeaderStyle, headerStyle, NAV, wordmark

### Community 76 - "Design System TS Config"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, emitDeclarationOnly, incremental, noEmit, outDir, paths, plugins (+4 more)

### Community 77 - "Legal Pages & Next Config"
Cohesion: 0.22
Nodes (7): nextConfig, next, ref_sentry_nextjs_config, metadata, metadata, LegalPageShell(), LegalSection()

### Community 78 - "Root Layout & Theming"
Cohesion: 0.17
Nodes (11): ref_next_font_google, src_app_globals, dmSansHeading, geistMono, inter, metadata, RootLayout(), Toaster() (+3 more)

### Community 79 - "Stripe Webhook Handler"
Cohesion: 0.24
Nodes (12): stripe, dynamic, payloadFor(), POST(), respondOutcome(), asDate(), asId(), asRecord() (+4 more)

### Community 80 - "Orphan Media Cleanup Sweep"
Cohesion: 0.18
Nodes (9): ORPHAN_BLOB_MAX_AGE_MS, ORPHAN_SWEEP_LOOKUP_CHUNK, ORPHAN_SWEEP_MAX_REMOVALS, ORPHAN_SWEEP_MAX_SCANNED, SweepBlobListing, SweepDeps, SweepListPage, SweepOutcome (+1 more)

### Community 81 - "Database Schema & Indexes"
Cohesion: 0.21
Nodes (11): "Account", Account_userId_idx, Post_userId_createdAt_idx, Post_userId_publishedAt_idx, Post_userId_scheduledAt_idx, Session_userId_idx, "Post", "Subscription" (+3 more)

### Community 82 - "Stripe Checkout Flow"
Cohesion: 0.24
Nodes (11): billingConfig, CheckoutDeps, handleCheckout(), isHttpOrigin(), isPaidPlanId(), liveDeps, portalRedirect(), ExistingSubscription (+3 more)

### Community 83 - "Billing Section UI"
Cohesion: 0.20
Nodes (10): BillingSection(), changePlan(), openPortal(), startCheckout(), featureRow(), formatPeriodEnd(), isPaidPlanId(), planFeatureRows() (+2 more)

### Community 84 - "Input UI Component"
Cohesion: 0.23
Nodes (11): InputAddon(), InputAddonProps, inputAddonVariants, InputGroup(), InputGroupProps, inputGroupVariants, InputProps, inputVariants (+3 more)

### Community 85 - "Toast Notification UI"
Cohesion: 0.18
Nodes (3): Seed, toastStyle, viewportStyle

### Community 86 - "Dev Dependencies Config"
Cohesion: 0.18
Nodes (11): devDependencies, eslint, eslint-config-next, prisma, tailwindcss, @tailwindcss/postcss, tsx, @types/node (+3 more)

### Community 87 - "Account Connection Management"
Cohesion: 0.22
Nodes (9): accountInitial(), AccountsContent(), confirmPendingDisconnect(), handleConnect(), runDisconnectMulti(), getSearchParamMessage(), isExpired(), parseScheduleDenial() (+1 more)

### Community 88 - "OAuth Redirect Origin Validation"
Cohesion: 0.33
Nodes (8): originToAllowedHost(), resolveExtraTrustedOrigins(), BUILT_IN_HOSTS, firstHeaderValue(), isAllowedHost(), KNOWN_OAUTH_ERRORS, RedirectOriginInput, resolveRedirectOrigin()

### Community 89 - "Instagram Integration Tests"
Cohesion: 0.22
Nodes (7): calls, FetchCall, gate(), happyPhotoRoutes(), json(), route(), routes

### Community 90 - "TikTok Integration Tests"
Cohesion: 0.22
Nodes (6): calls, creatorResponse(), FetchCall, json(), responses, tokenResponse()

### Community 91 - "Calendar Component Design"
Cohesion: 0.20
Nodes (5): caption, MONTH, SELECTED, stack, TODAY

### Community 92 - "Collapsible Navigation UI"
Cohesion: 0.20
Nodes (5): caption, icon, rail, subRow, triggerRow

### Community 93 - "Radio Group UI Component"
Cohesion: 0.24
Nodes (9): @radix-ui/react-radio-group, RadioGroup(), RadioGroupContext, RadioGroupContextType, RadioGroupItem(), RadioGroupItemProps, RadioGroupProps, radioItemVariants (+1 more)

### Community 94 - "Marketing Features Data"
Cohesion: 0.24
Nodes (8): FAQS, metadata, SECONDARY_PLAN, CREATE_FEATURES, FeatureCategory, FeatureLink, PLAN_PUBLISH_FEATURES, PlatformLink

### Community 95 - "TikTok Photo Publish Tests"
Cohesion: 0.22
Nodes (5): calls, creatorResponse(), FetchCall, json(), responses

### Community 96 - "X Integration Tests"
Cohesion: 0.22
Nodes (5): calls, FetchCall, json(), refreshResponse(), routes

### Community 97 - "Billing Concurrency Tests"
Cohesion: 0.28
Nodes (6): liveBillingStores, BillingSubscriptionStore, WebhookEventStore, createUser(), RUN, tag()

### Community 99 - "Badge UI Component"
Cohesion: 0.25
Nodes (3): caption, row, stage

### Community 100 - "Checkbox Component Stories"
Cohesion: 0.25
Nodes (3): caption, row, stack

### Community 101 - "Input Component Stories"
Cohesion: 0.25
Nodes (3): caption, row, stack

### Community 102 - "Page Container Previews"
Cohesion: 0.25
Nodes (3): caption, rowStyle, SIZES

### Community 103 - "Platform Icon Previews"
Cohesion: 0.25
Nodes (3): caption, PLATFORMS, stage

### Community 104 - "Radio Group Component"
Cohesion: 0.25
Nodes (3): caption, itemRow, stack

### Community 105 - "Sidebar Menu Skeleton"
Cohesion: 0.25
Nodes (3): caption, groupLabel, panel

### Community 106 - "Switch Component Stories"
Cohesion: 0.25
Nodes (3): caption, row, stack

### Community 107 - "Tabs Component Stories"
Cohesion: 0.25
Nodes (3): caption, panel, stage

### Community 108 - "Abuse Concurrency Testing"
Cohesion: 0.29
Nodes (5): ref_node_crypto, isTransientAbuseError(), createUser(), createUsers(), RUN

### Community 109 - "Account Settings Client"
Cohesion: 0.29
Nodes (3): SettingsClient(), handleChangePassword(), validatePassword()

### Community 111 - "Label Component Stories"
Cohesion: 0.29
Nodes (3): field, Inline, stack

### Community 116 - "Spinner Component Stories"
Cohesion: 0.29
Nodes (3): caption, stage, Variants

### Community 117 - "Status Badge Previews"
Cohesion: 0.29
Nodes (3): caption, stage, STATUSES

### Community 118 - "Status Dot Component"
Cohesion: 0.29
Nodes (3): caption, stage, STATUSES

### Community 120 - "Media Image Optimization"
Cohesion: 0.43
Nodes (5): CANONICAL_IMAGE_QUALITY, CANONICAL_IMAGE_WIDTH, CANONICAL_JPEG_SKIP_BYTES, CanonicalImageSpec, selectImageOptimization()

### Community 130 - "TikTok Media Bridge Route"
Cohesion: 0.53
Nodes (5): GET(), handleBridge(), HEAD(), fetchPrivateBlob(), defaultFetchHead()

### Community 131 - "Rate Limiting Middleware"
Cohesion: 0.47
Nodes (4): PRODUCTION_URL, buckets, checkRateLimit(), resetRateLimit()

### Community 132 - "Component Docs Generator"
Cohesion: 0.40
Nodes (4): GROUP_BY_MODULE, modules, tally, ungrouped

### Community 135 - "ESLint Configuration"
Cohesion: 0.40
Nodes (4): eslintConfig, ref_eslint_config, ref_eslint_config_next_core_web_vitals, ref_eslint_config_next_typescript

### Community 136 - "Graphify Plugin"
Cohesion: 0.40
Nodes (3): IMPORTANT: keep the reminder string free of backticks and $(...) constructs., ref_fs, ref_path

### Community 137 - "Test User Cleanup Script"
Cohesion: 0.60
Nodes (4): Args, main(), parseArgs(), protectedEmails()

### Community 138 - "Admin Billing Panel"
Cohesion: 0.70
Nodes (5): AdminBillingPanel(), apply(), clear(), load(), simulateExpiration()

### Community 140 - "Abuse Event Migration"
Cohesion: 0.83
Nodes (3): "AbuseEvent", AbuseEvent_createdAt_idx, AbuseEvent_identityId_idx

## Knowledge Gaps
- **793 isolated node(s):** `NavItem`, `CollapsibleContentProps`, `CollapsibleProps`, `CollapsibleTriggerProps`, `DividerProps` (+788 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1181 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `Channel Feed Components` to `App Shell & Navigation`, `Dashboard Filters & Insights`, `Auth & Onboarding UI`, `Marketing Landing Pages`, `Error & Loading Boundaries`, `Dropdown Menu Component`, `Calendar Scheduling UI`, `Account Backend & Migrations`, `Post Composer UI`, `Marketing Homepage`, `Navbar & Drawer UI`, `Dialog & Preview Components`, `Banner UI Component`, `Package Manifest Config`, `Platform Preview Components`, `Empty State UI Components`, `Marketing Product Visuals`, `App Shell Sidebar`, `Collapsible Navigation UI`, `Radio Group UI Component`, `Marketing Features Data`, `Checkbox Component Stories`, `Input Component Stories`, `Page Container Previews`, `Tabs Component Stories`, `Alert Component Stories`, `Page Header Previews`, `Section Header Component`, `Banner Component Stories`, `Button Component Stories`, `Empty State Component`, `Empty Block Component`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `@prisma/client` connect `Platform Preview Components` to `Billing Concurrency Tests`, `Media Upload Authorization`, `Channel Feed Components`, `Free Tier Quota Kernel`, `Package Manifest Config`, `Test User Cleanup Script`, `Media Registration Polling`, `Account Backend & Migrations`, `Post Composer UI`, `Platform Capabilities Registry`, `Idempotent Post Creation`, `Bulk Post Scheduler`, `Multi-Platform Publish Dispatch`, `Abuse Detection System`, `Platform Provider Dispatch`, `Composer Preview Validation`, `CLI Admin Scripts`, `Post Creation Quota API`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `react` connect `Error & Loading Boundaries` to `App Shell & Navigation`, `Dashboard Filters & Insights`, `Auth & Onboarding UI`, `Channel Feed Components`, `Marketing Landing Pages`, `Calendar Scheduling UI`, `Account Backend & Migrations`, `Post Composer UI`, `Billing Entitlements & Gating`, `OTP E2E Test Scenarios`, `Marketing Homepage`, `Navbar & Drawer UI`, `Banner UI Component`, `Package Manifest Config`, `Status Tabs UI Component`, `Marketing Product Visuals`, `Switch UI Component`, `Root Layout & Theming`, `Input UI Component`, `Toast Notification UI`, `Radio Group UI Component`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **What connects `NavItem`, `CollapsibleContentProps`, `CollapsibleProps` to the rest of the system?**
  _793 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Navigation` be split into smaller, more focused modules?**
  _Cohesion score 0.02516339869281046 - nodes in this community are weakly interconnected._
- **Should `Dashboard Filters & Insights` be split into smaller, more focused modules?**
  _Cohesion score 0.04884004884004884 - nodes in this community are weakly interconnected._
- **Should `Auth & Onboarding UI` be split into smaller, more focused modules?**
  _Cohesion score 0.07581545694975023 - nodes in this community are weakly interconnected._