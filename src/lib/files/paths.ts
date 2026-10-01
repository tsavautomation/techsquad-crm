// How a file is named inside the app (FileItem.path), whatever holds it. Shared by server and browser.
//   <table>/<scope>/<field>/<uploader>/<name>   CRM storage (Supabase), e.g. signatures
//   onedrive:<drive item id>                     a saved attachment in OneDrive
//   od-upload:<upload id>                        a file sent to OneDrive, not attached to a record yet

export const ONEDRIVE = "onedrive:";
export const OD_UPLOAD = "od-upload:";

export const isOneDrivePath = (p: string) => p.startsWith(ONEDRIVE);
export const isPendingOneDrive = (p: string) => p.startsWith(OD_UPLOAD);
export const oneDriveId = (p: string) => p.slice(ONEDRIVE.length);
export const uploadIdOf = (p: string) => p.slice(OD_UPLOAD.length);

/** The app path for an attachments row. */
export const pathOf = (row: { provider: string; provider_path: string }) => (row.provider === "onedrive" ? ONEDRIVE + row.provider_path : row.provider_path);

/** OneDrive won't accept some characters, or names ending in a dot or space. */
export function safeName(s: string) {
  return (
    s
      .replace(/["*:<>?/\\|#%]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[. ]+$/, "")
      .slice(0, 120) || "Untitled"
  );
}
