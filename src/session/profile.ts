export interface ProfileInput {
  name: string;
  title?: string;
  location?: string;
  photoUri?: string;
}

export interface SavedProfile {
  displayName: string;
  title: string;
  location: string;
  photoUri: string;
}

const PHOTO_PATTERN = /^data:image\/(jpeg|png|webp);base64,/;

export function cleanProfile(input: ProfileInput): SavedProfile {
  return {
    displayName: input.name.trim(),
    title: cleanLine(input.title),
    location: cleanLine(input.location),
    photoUri: cleanPhoto(input.photoUri),
  };
}

export function cleanLine(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
}

export function cleanPhoto(value: string | undefined) {
  if (!value || !PHOTO_PATTERN.test(value) || value.length > 100000) {
    return "";
  }
  return value;
}

export function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}
