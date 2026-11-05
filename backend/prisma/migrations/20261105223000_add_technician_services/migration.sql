CREATE TABLE "_TechnicianServices" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_TechnicianServices_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_TechnicianServices_B_index" ON "_TechnicianServices"("B");

ALTER TABLE "_TechnicianServices"
ADD CONSTRAINT "_TechnicianServices_A_fkey"
FOREIGN KEY ("A") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_TechnicianServices"
ADD CONSTRAINT "_TechnicianServices_B_fkey"
FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
