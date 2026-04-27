"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  deleteProject,
  generateNextProjectName,
  getProjectIndex,
  saveProject,
  type ProjectIndexItem,
} from "@/lib/projects";

export default function Page() {
  const [projects, setProjects] = useState<ProjectIndexItem[]>([]);

  function reload() {
    setProjects(getProjectIndex());
  }

  useEffect(() => {
    reload();
  }, []);

  function handleCreateProject() {
    const id = crypto.randomUUID();
    const now = Date.now();
    const name = generateNextProjectName();

    saveProject({
      id,
      name,
      createdAt: now,
      updatedAt: now,
      data: {
        shapes: [],
        metersPerPixel: 0,
        calibrationPoints: [],
      },
    });

    window.location.href = `/project/${id}`;
  }

  function handleDeleteProject(id: string) {
    deleteProject(id);
    reload();
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>ElectroBoard</h1>
          <div style={styles.subtitle}>Список проектов</div>
        </div>

        <button style={styles.primaryBtn} onClick={handleCreateProject}>
          + Новый проект
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={styles.emptyCard}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            Пока нет проектов
          </div>
          <div style={{ color: "#b9c7ef", marginBottom: 14 }}>
            Создайте первый проект и начните работу.
          </div>
          <button style={styles.primaryBtn} onClick={handleCreateProject}>
            Создать Project 1
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {projects.map((project) => (
            <div key={project.id} style={styles.card}>
              <div style={styles.cardTitle}>{project.name}</div>
              <div style={styles.cardMeta}>
                Обновлён: {new Date(project.updatedAt).toLocaleString()}
              </div>

              <div style={styles.cardActions}>
                <Link href={`/project/${project.id}`} style={styles.linkBtn}>
                  Открыть
                </Link>
                <button
                  style={styles.deleteBtn}
                  onClick={() => handleDeleteProject(project.id)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0b1020",
    color: "#f2f6ff",
    padding: 24,
    fontFamily: "Inter, Arial, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 34,
  },
  subtitle: {
    color: "#b9c7ef",
    marginTop: 6,
  },
  primaryBtn: {
    background: "#2948c7",
    color: "#fff",
    border: "1px solid #7aa0ff",
    borderRadius: 10,
    padding: "12px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },
  emptyCard: {
    maxWidth: 520,
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 16,
    padding: 24,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    background: "#121937",
    border: "1px solid #26305b",
    borderRadius: 16,
    padding: 18,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
  },
  cardMeta: {
    color: "#b9c7ef",
    fontSize: 14,
    marginBottom: 14,
  },
  cardActions: {
    display: "flex",
    gap: 10,
  },
  linkBtn: {
    display: "inline-block",
    textDecoration: "none",
    background: "#1a234a",
    color: "#fff",
    border: "1px solid #33407a",
    borderRadius: 10,
    padding: "10px 14px",
  },
  deleteBtn: {
    background: "#4a1d24",
    color: "#fff",
    border: "1px solid #8a3f4d",
    borderRadius: 10,
    padding: "10px 14px",
    cursor: "pointer",
  },
};
