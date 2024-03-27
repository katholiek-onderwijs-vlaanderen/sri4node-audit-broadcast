export type TSri4NodeAuditBroadcastPluginConfig = {
  component: string;
  versionApiBase: string;
  headers: Array<Record<string, string>>;
  auth: { user: string; pass: string };
  omitProperties: {
    [type: string]: Array<string>;
  };
};

/**
 * The version resource object, the record that will actually be stored in the /versions api.
 * This is the object that will be sent to the /versions api.
 * It contains info about who made the change, what kind of change, when it was made,
 * and what the change was, including e full version of the resource.
 */
export type TSriVersionResource = {
  /** guid of this version */
  key: string;
  /** a permalink to the person that has made the modification (example: /perons/35764) */
  person: string;
  /** a timestamp like this: 2024-01-01T00:00:00Z */
  timestamp: string;
  /** a permalink to a /security/components resource (indicating to which api it belongs) */
  component: string;
  /** the operation that has been executed on the resource */
  operation: 'CREATE' | 'UPDATE' | 'DELETE'; // patch?
  /** the resource type (example: PERSON) */
  type: string;
  /** a premalinl to the resource (example: /mythings/12345) */
  resource: string;
  /** the version of the document at the time of the modification */
  document: Record<string, any>;
};
