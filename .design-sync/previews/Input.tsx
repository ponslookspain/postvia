import {
  Input,
  InputAddon,
  InputGroup,
  InputWrapper,
  Label,
} from "postvia";
import { AtSign, Link2, Search } from "lucide-react";

/**
 * Input previews. The Radian numeric size scale ("28"–"48", default "36"),
 * the resting/readonly/disabled/invalid states, and the two composition
 * shells the app uses around a bare input: InputGroup + InputAddon (a prefix
 * such as a channel handle or a URL scheme) and InputWrapper (an icon sharing
 * the input's own box, which is how the posts search field reads).
 */

const stack: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  width: 340,
};

const row: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.2,
  color: "var(--color-muted-foreground, #6b7280)",
};

export function Sizes() {
  return (
    <div style={stack}>
      {(["28", "32", "36", "40", "44", "48"] as const).map((size) => (
        <div key={size} style={row}>
          <span style={caption}>size="{size}"</span>
          <Input size={size} defaultValue="rosa@studio.co" />
        </div>
      ))}
    </div>
  );
}

export function States() {
  return (
    <div style={stack}>
      <div style={row}>
        <span style={caption}>placeholder</span>
        <Input type="search" placeholder="Search posts…" />
      </div>
      <div style={row}>
        <span style={caption}>filled</span>
        <Input defaultValue="Autumn launch teaser" />
      </div>
      <div style={row}>
        <span style={caption}>aria-invalid</span>
        <Input type="email" defaultValue="rosa@studio" aria-invalid />
      </div>
      <div style={row}>
        <span style={caption}>readOnly</span>
        <Input readOnly defaultValue="postvia.app/r/rosa-studio" />
      </div>
      <div style={row}>
        <span style={caption}>disabled</span>
        <Input disabled defaultValue="rosa@studio.co" />
      </div>
    </div>
  );
}

export function WithAddon() {
  return (
    <div style={stack}>
      <div style={row}>
        <Label htmlFor="in-handle">Instagram handle</Label>
        <InputGroup>
          <InputAddon>
            <AtSign />
          </InputAddon>
          <Input id="in-handle" defaultValue="rosa.studio" />
        </InputGroup>
      </div>
      <div style={row}>
        <Label htmlFor="in-link">Link in post</Label>
        <InputGroup>
          <InputAddon>https://</InputAddon>
          <Input id="in-link" defaultValue="rosastudio.co/autumn" />
        </InputGroup>
      </div>
      <div style={row}>
        <Label htmlFor="in-slug">Short link</Label>
        <InputGroup>
          <Input id="in-slug" defaultValue="autumn-teaser" />
          <InputAddon mode="icon">
            <Link2 />
          </InputAddon>
        </InputGroup>
      </div>
    </div>
  );
}

export function Wrapped() {
  return (
    <div style={stack}>
      <div style={row}>
        <span style={caption}>InputWrapper — leading icon</span>
        <InputWrapper>
          <Search />
          <Input placeholder="Search posts…" />
        </InputWrapper>
      </div>
      <div style={row}>
        <span style={caption}>InputWrapper — size="44"</span>
        <InputWrapper size="44">
          <Search />
          <Input placeholder="Search posts…" />
        </InputWrapper>
      </div>
      <div style={row}>
        <span style={caption}>InputWrapper — disabled</span>
        <InputWrapper disabled>
          <Search />
          <Input placeholder="Search posts…" disabled />
        </InputWrapper>
      </div>
    </div>
  );
}
