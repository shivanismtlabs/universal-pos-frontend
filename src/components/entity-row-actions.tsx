"use client";

import { Archive, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  onEdit?: () => void;
  onSoftDelete?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  softDeleteTitle?: string;
  deleteTitle?: string;
  softDeleteHidden?: boolean;
  deleteHidden?: boolean;
  className?: string;
  disabled?: boolean;
};

/**
 * Shared Zoho-style row actions: Edit · Soft delete (archive/deactivate) · Delete.
 * Ghost icon buttons — no heavy black chip borders.
 */
export function EntityRowActions({
  onEdit,
  onSoftDelete,
  onDelete,
  editTitle = "Edit",
  softDeleteTitle = "Archive",
  deleteTitle = "Delete permanently",
  softDeleteHidden,
  deleteHidden,
  className,
  disabled,
}: Props) {
  return (
    <div
      className={cn("inline-flex items-center justify-end gap-0.5", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {onEdit ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 px-0 text-[#5a6b7d]"
          title={editTitle}
          disabled={disabled}
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
          <span className="sr-only">{editTitle}</span>
        </Button>
      ) : null}
      {onSoftDelete && !softDeleteHidden ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 px-0 text-[#5a6b7d]"
          title={softDeleteTitle}
          disabled={disabled}
          onClick={onSoftDelete}
        >
          <Archive className="size-3.5" />
          <span className="sr-only">{softDeleteTitle}</span>
        </Button>
      ) : null}
      {onDelete && !deleteHidden ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 px-0 text-[#b42318] hover:bg-[#fff6f6] hover:text-[#912018]"
          title={deleteTitle}
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
          <span className="sr-only">{deleteTitle}</span>
        </Button>
      ) : null}
    </div>
  );
}
