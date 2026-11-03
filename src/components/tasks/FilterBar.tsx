export type Filters = {
  effort: string;
  status: string;
  personId: string;
};

export const DEFAULT_FILTERS: Filters = {
  effort: "",
  status: "",
  personId: "",
};
