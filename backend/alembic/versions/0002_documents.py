"""documents; drop payments.receipt_path

Revision ID: 0002
Revises: 0001
"""
import sqlalchemy as sa

from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('documents',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('category', sa.String(length=24), nullable=False),
    sa.Column('document_date', sa.Date(), nullable=True),
    sa.Column('valid_until', sa.Date(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('original_name', sa.String(length=500), nullable=False),
    sa.Column('mime_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.BigInteger(), nullable=False),
    sa.Column('storage_key', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=8), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('installment_id', sa.String(length=36), nullable=True),
    sa.Column('obligation_id', sa.String(length=36), nullable=True),
    sa.Column('task_id', sa.String(length=36), nullable=True),
    sa.Column('milestone_key', sa.String(length=32), nullable=True),
    sa.CheckConstraint('(CASE WHEN installment_id IS NULL THEN 0 ELSE 1 END + CASE WHEN obligation_id IS NULL THEN 0 ELSE 1 END + CASE WHEN task_id IS NULL THEN 0 ELSE 1 END + CASE WHEN milestone_key IS NULL THEN 0 ELSE 1 END) <= 1', name='ck_documents_single_link'),
    sa.ForeignKeyConstraint(['installment_id'], ['installments.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['milestone_key'], ['milestones.key'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['obligation_id'], ['obligations.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('storage_key')
    )
    op.create_index(op.f('ix_documents_installment_id'), 'documents', ['installment_id'], unique=False)
    op.create_index(op.f('ix_documents_milestone_key'), 'documents', ['milestone_key'], unique=False)
    op.create_index(op.f('ix_documents_obligation_id'), 'documents', ['obligation_id'], unique=False)
    op.create_index(op.f('ix_documents_status'), 'documents', ['status'], unique=False)
    op.create_index(op.f('ix_documents_task_id'), 'documents', ['task_id'], unique=False)
    op.create_index(op.f('ix_documents_valid_until'), 'documents', ['valid_until'], unique=False)
    op.drop_column('payments', 'receipt_path')


def downgrade() -> None:
    op.add_column('payments', sa.Column('receipt_path', sa.String(length=500), nullable=True))
    op.drop_table('documents')
