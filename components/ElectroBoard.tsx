function handleCanvasMouseUp() {
  if (draftLine) {
    setShapes((prev) => [...prev, draftLine]);
    setDraftLine(null);
    setTool("select");
    return;
  }

  if (interaction && (interaction.mode === "line-start" || interaction.mode === "line-end")) {
    setShapes((prev) => {
      const updated = prev.map((shape) => {
        if (shape.id !== interaction.shapeId) return shape;
        if (shape.type !== "line" && shape.type !== "cable") return shape;

        const point =
          interaction.mode === "line-start"
            ? { x: shape.x, y: shape.y }
            : { x: shape.x2, y: shape.y2 };

        const snap = findClosestAnchor(prev, point, 22, shape.id);

        if (!snap) {
          if (interaction.mode === "line-start") {
            return { ...shape, startAttachment: undefined };
          }
          return { ...shape, endAttachment: undefined };
        }

        if (interaction.mode === "line-start") {
          return {
            ...shape,
            x: snap.x,
            y: snap.y,
            startAttachment: {
              shapeId: snap.shapeId,
              anchorId: snap.anchorId,
            },
          };
        }

        return {
          ...shape,
          x2: snap.x,
          y2: snap.y,
          endAttachment: {
            shapeId: snap.shapeId,
            anchorId: snap.anchorId,
          },
        };
      });

      return applyAttachments(updated);
    });
  } else {
    setShapes((prev) => applyAttachments(prev));
  }

  setInteraction(null);
}
