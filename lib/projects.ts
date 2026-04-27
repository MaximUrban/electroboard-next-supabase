export type ProjectIndexItem = {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
};

export type SavedProjectData = {
  id: string;
  name: string;
  data: any;
  updatedAt: number;
  createdAt: number;
};

const INDEX_KEY = "electroboard_project_index";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getProjectIndex(): ProjectIndexItem[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectIndex(index: ProjectIndexItem[]) {
  if (!isBrowser()) return;
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function getProjectStorageKey(id: string) {
  return `electroboard_project_${id}`;
}

export function getProjectById(id: string): SavedProjectData | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(getProjectStorageKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveProject(project: SavedProjectData) {
  if (!isBrowser()) return;

  localStorage.setItem(getProjectStorageKey(project.id), JSON.stringify(project));

  const index = getProjectIndex();
  const existing = index.find((p) => p.id === project.id);

  if (existing) {
    existing.name = project.name;
    existing.updatedAt = project.updatedAt;
  } else {
    index.unshift({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
    });
  }

  index.sort((a, b) => b.updatedAt - a.updatedAt);
  saveProjectIndex(index);
}

export function deleteProject(id: string) {
  if (!isBrowser()) return;

  localStorage.removeItem(getProjectStorageKey(id));
  const next = getProjectIndex().filter((p) => p.id !== id);
  saveProjectIndex(next);
}

export function generateNextProjectName() {
  const index = getProjectIndex();
  let n = 1;

  while (index.some((p) => p.name === `Project ${n}`)) {
    n += 1;
  }

  return `Project ${n}`;
}
