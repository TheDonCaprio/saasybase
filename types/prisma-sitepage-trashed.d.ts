declare module '@prisma/client' {
  namespace Prisma {
    interface SitePageWhereInput {
      trashedAt?: Date | string | null | DateTimeNullableFilter<'SitePage'>;
    }

    interface SitePageOrderByWithRelationInput {
      trashedAt?: SortOrderInput | SortOrder;
    }

    interface SitePageUpdateManyMutationInput {
      trashedAt?: Date | string | null | NullableDateTimeFieldUpdateOperationsInput;
    }

    interface SitePageUncheckedUpdateManyInput {
      trashedAt?: Date | string | null | NullableDateTimeFieldUpdateOperationsInput;
    }

    interface SitePageUpdateInput {
      trashedAt?: Date | string | null | NullableDateTimeFieldUpdateOperationsInput;
    }

    interface SitePageUncheckedUpdateInput {
      trashedAt?: Date | string | null | NullableDateTimeFieldUpdateOperationsInput;
    }

    interface SitePageCreateInput {
      trashedAt?: Date | string | null;
    }

    interface SitePageUncheckedCreateInput {
      trashedAt?: Date | string | null;
    }
  }
}

export {};
