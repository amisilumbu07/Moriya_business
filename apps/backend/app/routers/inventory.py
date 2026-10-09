from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.inventory import get_next_expiry, get_quantity_on_hand, is_low_stock
from app.models import Product, StockAdjustment, StockBatch, User

router = APIRouter(prefix="/api", tags=["inventory"], dependencies=[Depends(current_user)])

MAX_INT = 2_000_000_000


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    category: str = Field(default="", max_length=50)
    unit: str = Field(default="piece", min_length=1, max_length=20)
    selling_price: int = Field(ge=0, le=MAX_INT)
    reorder_level: int = Field(default=0, ge=0, le=MAX_INT)


class ProductPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category: str | None = Field(default=None, max_length=50)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    selling_price: int | None = Field(default=None, ge=0, le=MAX_INT)
    reorder_level: int | None = Field(default=None, ge=0, le=MAX_INT)
    is_active: bool | None = None


class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    unit: str
    selling_price: int
    reorder_level: int
    is_active: bool
    quantity_on_hand: int
    next_expiry: date | None
    low_stock: bool


class BatchOut(BaseModel):
    id: int
    product_id: int
    quantity_received: int
    quantity_remaining: int
    cost_price: int
    received_at: date
    expiry_date: date | None

    model_config = {"from_attributes": True}


class ReceiveIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=MAX_INT)
    cost_price: int = Field(ge=0, le=MAX_INT)
    received_at: date
    expiry_date: date | None = None

    @model_validator(mode="after")
    def expiry_not_before_received(self):
        if self.expiry_date is not None and self.expiry_date < self.received_at:
            raise ValueError("Expiry date cannot be before the received date")
        return self


class AdjustIn(BaseModel):
    batch_id: int
    quantity_change: int = Field(ge=-MAX_INT, le=MAX_INT)
    reason: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def nonzero(self):
        if self.quantity_change == 0:
            raise ValueError("Quantity change cannot be zero")
        return self


def _product_out(db: Session, p: Product) -> ProductOut:
    qty = get_quantity_on_hand(db, p.id)
    return ProductOut(
        id=p.id,
        name=p.name,
        category=p.category,
        unit=p.unit,
        selling_price=p.selling_price,
        reorder_level=p.reorder_level,
        is_active=p.is_active,
        quantity_on_hand=qty,
        next_expiry=get_next_expiry(db, p.id),
        low_stock=is_low_stock(qty, p.reorder_level),
    )


def _get_product(db: Session, product_id: int) -> Product:
    p = db.get(Product, product_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return p


@router.get("/products", response_model=list[ProductOut])
def list_products(
    search: str = Query(default="", max_length=100),
    category: str = Query(default="", max_length=50),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    q = select(Product).order_by(Product.name)
    if not include_inactive:
        q = q.where(Product.is_active.is_(True))
    if search.strip():
        q = q.where(func.lower(Product.name).contains(search.strip().lower()))
    if category:
        q = q.where(Product.category == category)
    return [_product_out(db, p) for p in db.scalars(q)]


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    return list(db.scalars(select(Product.category).where(Product.category != "").distinct().order_by(Product.category)))


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(body: ProductIn, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Name is required")
    p = Product(**{**body.model_dump(), "name": name, "category": body.category.strip()})
    db.add(p)
    db.commit()
    return _product_out(db, p)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: ProductPatch, db: Session = Depends(get_db)):
    p = _get_product(db, product_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(p, field, value.strip() if isinstance(value, str) else value)
    if not p.name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Name is required")
    db.commit()
    return _product_out(db, p)


@router.get("/products/{product_id}/batches", response_model=list[BatchOut])
def list_batches(product_id: int, db: Session = Depends(get_db)):
    _get_product(db, product_id)
    q = (
        select(StockBatch)
        .where(StockBatch.product_id == product_id)
        .order_by(StockBatch.received_at.desc(), StockBatch.id.desc())
    )
    return list(db.scalars(q))


@router.post("/stock/receive", response_model=BatchOut, status_code=status.HTTP_201_CREATED)
def receive_stock(body: ReceiveIn, db: Session = Depends(get_db)):
    product = _get_product(db, body.product_id)
    if not product.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "This product is deactivated")
    batch = StockBatch(
        product_id=product.id,
        quantity_received=body.quantity,
        quantity_remaining=body.quantity,
        cost_price=body.cost_price,
        received_at=body.received_at,
        expiry_date=body.expiry_date,
    )
    db.add(batch)
    db.commit()
    return batch


@router.post("/stock/adjust", response_model=BatchOut)
def adjust_stock(body: AdjustIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    batch = db.get(StockBatch, body.batch_id)
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found")
    new_remaining = batch.quantity_remaining + body.quantity_change
    if new_remaining < 0:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Only {batch.quantity_remaining} left in this batch; cannot remove more"
        )
    if new_remaining > MAX_INT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Quantity too large")
    batch.quantity_remaining = new_remaining
    db.add(StockAdjustment(
        batch_id=batch.id, quantity_change=body.quantity_change, reason=body.reason.strip(), user_id=user.id
    ))
    db.commit()
    return batch
