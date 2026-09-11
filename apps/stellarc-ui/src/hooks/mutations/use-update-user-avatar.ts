import { useMutation, useQueryClient } from "@tanstack/react-query";
import uploadAvatar from "@/fetchers/user/upload-avatar";
import { authClient } from "@/lib/auth-client";
import { prepareAvatarImage } from "@/lib/prepare-avatar-image";
import invalidateUserProfileQueries from "./invalidate-user-profile-queries";

/**
 * The File is normally produced by AvatarCropDialog, which already exported a
 * 256x256 WebP/PNG. prepareAvatarImage still runs as the guard rail: it
 * re-encodes to exactly AVATAR_OUTPUT_SIZE, so hand-rolled callers that pass
 * a raw photo still end up square and size-bounded. A center-crop is only
 * applied when the input is NOT already square (crop dialog output is, so it
 * passes through untouched apart from re-encode).
 */
function useUpdateUserAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const { contentType, data } = await prepareAvatarImage(file);
      const avatar = await uploadAvatar({ contentType, data });

      const { error } = await authClient.updateUser({ image: avatar.url });

      if (error) {
        throw new Error(error.message || "Failed to update profile picture");
      }

      return avatar;
    },
    onSuccess: () => invalidateUserProfileQueries(queryClient),
  });
}

export default useUpdateUserAvatar;
