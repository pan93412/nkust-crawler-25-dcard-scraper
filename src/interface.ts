// Types
export interface NewArticleDto {
  id: string;
  url: string;
  title: string;
  content: string;
  created_at: string;
}

export interface NewCommentDto {
  id: string;
  content: string;
  author: string;
  likes: number;
  created_at: string;
}

export interface NewReplyDto extends NewCommentDto {}
