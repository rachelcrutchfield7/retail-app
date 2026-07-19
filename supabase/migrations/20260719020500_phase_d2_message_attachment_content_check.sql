-- ReTail Security Remediation Phase D.2
-- Permit private image attachments in the message content check.

alter table public.messages
  drop constraint if exists message_has_content;

alter table public.messages
  add constraint message_has_content check (
    (
      message_type = 'text'
      and body is not null
      and char_length(body) between 1 and 2000
      and image_url is null
      and attachment_bucket is null
      and attachment_path is null
      and attachment_mime_type is null
      and attachment_size_bytes is null
    )
    or (
      message_type = 'image'
      and image_url is null
      and attachment_bucket is not null
      and attachment_path is not null
      and attachment_mime_type is not null
      and attachment_size_bytes is not null
      and attachment_size_bytes > 0
    )
    or (
      message_type = 'system'
      and body is not null
      and char_length(body) between 1 and 2000
      and image_url is null
      and attachment_bucket is null
      and attachment_path is null
      and attachment_mime_type is null
      and attachment_size_bytes is null
    )
  );
