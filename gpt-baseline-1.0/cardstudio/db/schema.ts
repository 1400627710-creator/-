import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const projects=sqliteTable('projects',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),title:text('title').notNull(),revision:integer('revision').notNull().default(0),blobKey:text('blob_key').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),archived:integer('archived').notNull().default(0)
},t=>[index('projects_owner').on(t.ownerId)]);
export const revisions=sqliteTable('project_revisions',{
 projectId:text('project_id').notNull(),ownerId:text('owner_id').notNull(),revision:integer('revision').notNull(),blobKey:text('blob_key').notNull(),label:text('label').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.projectId,t.revision]})]);
export const drafts=sqliteTable('import_drafts',{
 id:text('id').primaryKey(),projectId:text('project_id').notNull(),ownerId:text('owner_id').notNull(),baseRevision:integer('base_revision').notNull(),blobKey:text('blob_key').notNull(),status:text('status').notNull().default('pending'),createdAt:text('created_at').notNull(),resultRevision:integer('result_revision')
},t=>[index('drafts_owner_project').on(t.ownerId,t.projectId)]);
export const requests=sqliteTable('mutation_requests',{
 projectId:text('project_id').notNull(),ownerId:text('owner_id').notNull(),requestId:text('request_id').notNull(),hash:text('hash').notNull(),revision:integer('revision').notNull(),result:text('result').notNull(),createdAt:text('created_at').notNull()
},t=>[primaryKey({columns:[t.projectId,t.requestId]})]);
