-- Apply as the owner after schema migration, in the dedicated SmartMap database.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO smartmap_web;
GRANT SELECT ON foods, pois TO smartmap_web;
GRANT UPDATE (rating) ON pois TO smartmap_web;
GRANT SELECT, INSERT, UPDATE ON users, user_preferences, user_visit_history, user_preference_params, poi_ratings, diary_views, diary_comments, diary_ratings, diary_notifications, diary_animation_tasks, discover_reviews TO smartmap_web;
GRANT SELECT, INSERT, UPDATE, DELETE ON diaries, diary_media, diary_media_content, diary_reactions, discover_reactions TO smartmap_web;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO smartmap_web;
