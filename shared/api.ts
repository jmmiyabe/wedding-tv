/** Request/response shapes and input limits shared by the SPA and the API. */

export const LIMITS = {
  nameLength: 100,
  householdNameLength: 120,
  dietaryLength: 500,
  messageLength: 1000,
  notesLength: 1000,
  maxAttendeesCap: 20,
  maxMembers: 20,
  usernameLength: 32,
  passwordMaxLength: 256,
} as const;

export type RsvpStatus = "pending" | "attending" | "declined";

export interface RsvpResponse {
  attending: boolean;
  attendees: string[];
  dietary: string;
  message: string;
  /** Opaque concurrency token. Send it back unchanged when updating. */
  revision: string;
  respondedBy: "guest" | "admin";
  updatedAt: string;
}

export interface RsvpInput {
  attending: boolean;
  /** Names of everyone attending. Empty when declining. */
  attendees: string[];
  dietary: string;
  message: string;
  /** `null` for a first response, otherwise the revision you last loaded. */
  revision: string | null;
}

/** What an authorized guest can see about their own invitation. */
export interface InvitationView {
  householdName: string;
  maxAttendees: number;
  members: string[];
  rsvp: RsvpResponse | null;
  deadline: string;
  deadlinePassed: boolean;
  canRespond: boolean;
}

export interface AdminHousehold {
  id: number;
  displayName: string;
  maxAttendees: number;
  members: string[];
  notes: string;
  hasAccess: boolean;
  status: RsvpStatus;
  rsvp: RsvpResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminHouseholdInput {
  displayName: string;
  maxAttendees: number;
  members: string[];
  notes: string;
}

export interface AdminStats {
  households: { invited: number; attending: number; declined: number; pending: number };
  people: { invitedSeats: number; confirmedAttendees: number };
}

export interface InviteCodeResult {
  household: AdminHousehold;
  /** Shown once. Only a hash is stored, so it cannot be retrieved later. */
  inviteCode: string;
}

/** Error codes returned as `{ "error": code }`. */
export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "rsvp_closed"
  | "too_many_attendees"
  | "invalid_code"
  | "invalid_credentials"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media_type"
  | "server_error";
