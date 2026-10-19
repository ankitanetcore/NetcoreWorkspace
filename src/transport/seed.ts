import type { TransportSnapshots } from "@/transport/types";

export const seed: TransportSnapshots = {
  rooms: {
    rooms: [
      { id: "general", name: "General", messages: [], access: "everyone", memberIds: [] },
      { id: "gtm", name: "GTM", messages: [], access: "everyone", memberIds: [] },
      { id: "engineering", name: "Engineering", messages: [], access: "everyone", memberIds: [] },
    ],
  },
  files: {
    folders: [
      {
        id: "yours",
        name: "Yours",
        files: [],
      },
      {
        id: "notes",
        name: "Notes",
        files: [
          {
            id: "yesterday",
            name: "yesterday.txt",
            detail: "Updated yesterday",
            body: "Yesterday\n\nGeneral is for everyday conversation.\nGTM is for go-to-market work.\nEngineering is for the build.",
          },
          {
            id: "open-questions",
            name: "open-questions.txt",
            detail: "Updated this morning",
            body: "Open questions\n\nWho keeps the shared notes current?\nShould sketches stay beside the notes?\nWhat do we want to look at together on the next call?",
          },
        ],
      },
      {
        id: "sketches",
        name: "Sketches",
        files: [
          {
            id: "table-layout",
            name: "table-layout.txt",
            detail: "Updated yesterday",
            body: "Table layout\n\nA long table, three seats, and a clear wall for notes.\nKeep the middle open so people can gather without a fixed front.",
          },
        ],
      },
      {
        id: "shared",
        name: "Shared",
        files: [
          {
            id: "welcome",
            name: "welcome.txt",
            detail: "Updated last week",
            body: "Shared\n\nThis folder is for anything the whole group should be able to find.\nThe notes and the table sketch are the current set.",
          },
        ],
      },
    ],
  },
  direct: {
    threads: [],
  },
  call: {
    participants: [],
  },
  presence: {
    peers: [],
  },
};
