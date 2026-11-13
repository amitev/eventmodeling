import { createContext } from 'react';

// What the nodes may ask the board to do. `Board()` provides the real values.
export const BoardActions = createContext({
  editScenario: () => {},
  newScenarioId: () => '',
  rememberCopy: () => {},
  copyContext: () => {},
  openInfo: () => {},
  openFields: () => {},
  openHtml: () => {},
  viewHtml: () => {},
  goToOriginal: () => {},
  openMovie: () => {},
  viewScenarios: () => {},
  readInfo: () => {},
  titleEditId: null,
  clearTitleEdit: () => {},
  contexts: [],
  setChapterContext: () => {},
  addContext: () => {},
  activate: () => {},
  clearCell: () => {},
  addSliceAfter: () => {},
  removeSlice: () => {},
  selectCell: () => {},
  removeLane: () => {},
  addLaneAfter: () => {},
  removeChapter: () => {},
  compactChapter: () => {},
  overview: false,
  activeId: null,
});

export const CopySelection = createContext(new Set());
