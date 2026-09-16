import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "postvia";
import {
  EyeIcon,
  LogOutIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  SettingsIcon,
  SunIcon,
  Trash2Icon,
} from "lucide-react";

/**
 * DropdownMenu previews, ported from the two menus the app actually ships:
 * the posts-table row menu (PostRowMenu) and the sidebar account menu
 * (Sidebar), which is the only place the Sub / RadioGroup composition is
 * used. Each cell is `defaultOpen` so the portal content is in the capture;
 * scaffolding uses inline styles, not Tailwind utilities.
 */

export function PostRowActions() {
  return (
    <div style={{ padding: 16, display: "flex", justifyContent: "flex-start" }}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger aria-label="Actions for post" asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" style={{ width: 208 }}>
          <DropdownMenuItem>
            <PencilIcon aria-hidden="true" />
            Edit draft
          </DropdownMenuItem>
          <DropdownMenuItem>
            <EyeIcon aria-hidden="true" />
            View post
            <DropdownMenuShortcut>Ctrl V</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <RotateCcwIcon aria-hidden="true" />
            Retry publish
          </DropdownMenuItem>
          <DropdownMenuDivider />
          <DropdownMenuItem>
            <Trash2Icon aria-hidden="true" />
            Delete post
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AccountMenu() {
  return (
    <div style={{ padding: 16 }}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Account</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" style={{ width: 224 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 8px",
            }}
          >
            <Avatar size="32">
              <AvatarFallback>A</AvatarFallback>
            </Avatar>
            <div style={{ minWidth: 0, flex: 1, fontSize: 14 }}>
              <p style={{ fontWeight: 500, lineHeight: "20px" }}>Alex Rivera</p>
              <p style={{ fontSize: 12, lineHeight: "16px", opacity: 0.66 }}>
                alex@postvia.app
              </p>
            </div>
          </div>
          <DropdownMenuDivider />
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>
              <MoonIcon aria-hidden="true" />
              Appearance
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value="dark">
                <DropdownMenuRadioItem value="light">
                  <SunIcon aria-hidden="true" />
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  <MoonIcon aria-hidden="true" />
                  Dark
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem>
            <SettingsIcon aria-hidden="true" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuDivider />
          <DropdownMenuItem>
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ChannelFilter() {
  return (
    <div style={{ padding: 16 }}>
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Channels</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" style={{ width: 216 }}>
          <DropdownMenuLabel>Show posts from</DropdownMenuLabel>
          <DropdownMenuCheckboxItem checked>Instagram</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked>Threads</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false}>
            TikTok
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={false} disabled>
            X — reconnect required
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
