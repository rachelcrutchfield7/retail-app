-- ReTail Security Remediation Phase D.2
-- Allow uploaders to delete their own unsent message attachments.

drop policy if exists "Phase D uploader can inspect own unsent message images for cleanup"
  on storage.objects;

create policy "Phase D uploader can inspect own unsent message images for cleanup"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-images'
  and storage.allow_any_operation(array[
    'object.delete',
    'object.get_authenticated_info'
  ])
  and private.is_valid_message_attachment_path(
    name,
    private.uuid_from_text((storage.foldername(name))[1]),
    auth.uid()
  )
  and private.is_account_active(auth.uid())
  and private.is_conversation_participant(private.uuid_from_text((storage.foldername(name))[1]), auth.uid())
);
