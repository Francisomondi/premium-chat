import axiosInstance from "../axiosInstance.js";

export const getMyConversationMedia = async ({
  conversationId,
  page = 1,
  limit = 24,
  signal,
} = {}) => {
  if (!conversationId) {
    throw new Error("A conversation ID is required.");
  }

  const response = await axiosInstance.get(
    `/conversations/${conversationId}/my-media`,
    {
      params: {
        page,
        limit,
      },
      signal,
    }
  );

  if (!response.data?.success) {
    throw new Error(
      response.data?.message ||
        "Failed to retrieve your conversation media."
    );
  }

  return response.data.data;
};