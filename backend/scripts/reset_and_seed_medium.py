#!/usr/bin/env python3
import os
import random
from datetime import date, datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from auth import get_password_hash
from models import (
    AdminLog,
    Department,
    PdaAdmin,
    PdaGallery,
    PdaItem,
    PdaTeam,
    PdaUser,
    SystemConfig,
)


def _load_db_url() -> str:
    root = os.path.dirname(os.path.dirname(__file__))
    load_dotenv(os.path.join(root, ".env"))
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not configured in backend/.env")
    return db_url


def _is_local_host(host: str | None) -> bool:
    if host is None:
        # Unix socket / file-backed local database.
        return True
    normalized = host.strip().lower()
    return normalized in {"localhost", "127.0.0.1", "::1"}


def _assert_reset_allowed(db_url: str) -> None:
    allow = os.environ.get("ALLOW_DB_RESET", "").strip().lower()
    if allow != "true":
        raise RuntimeError(
            "Refusing destructive reset. Set ALLOW_DB_RESET=true to run this script."
        )

    url = make_url(db_url)
    if not _is_local_host(url.host):
        raise RuntimeError(
            f"Refusing destructive reset on non-local DB host: {url.host!r}. "
            "Only localhost/127.0.0.1/::1 are allowed."
        )


def _truncate_all(engine) -> None:
    with engine.begin() as conn:
        tables = conn.execute(
            text(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename <> 'alembic_version'
                ORDER BY tablename
                """
            )
        ).fetchall()
        names = [row[0] for row in tables]
        if not names:
            return
        table_sql = ", ".join(f'"{t}"' for t in names)
        conn.execute(text(f"TRUNCATE TABLE {table_sql} RESTART IDENTITY CASCADE"))


def seed() -> None:
    random.seed(42)
    db_url = _load_db_url()
    _assert_reset_allowed(db_url)
    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    _truncate_all(engine)

    db = SessionLocal()
    try:
        db.add(SystemConfig(key="registration_open", value="true"))
        db.add(SystemConfig(key="pda_recruitment_open", value="true"))

        now = datetime.now(timezone.utc)
        depts = list(Department)

        users = []
        for i in range(20):
            reg = f"202250{3000+i}"
            u = PdaUser(
                regno=reg,
                email=f"pdauser{i+1}@example.com",
                hashed_password=get_password_hash("pda12345"),
                name=f"PDA User {i+1}",
                dob=date(2004, (i % 12) + 1, (i % 27) + 1),
                phno=f"8{(i+1):09d}"[-10:],
                dept=depts[i % len(depts)].value,
                instagram_url=f"https://instagram.com/pdauser{i+1}",
                linkedin_url=f"https://linkedin.com/in/pdauser{i+1}",
                github_url=f"https://github.com/pdauser{i+1}",
                image_url=f"https://picsum.photos/seed/pda{i+1}/300/300",
                json_content={"preferred_team": "Design" if i % 2 == 0 else "Event Management"},
                is_member=True,
            )
            users.append(u)
        super_user = PdaUser(
            regno="0000000000",
            email="superadmin@example.com",
            hashed_password=get_password_hash("admin123"),
            name="Super Admin",
            dob=date(2000, 1, 1),
            phno="9000000000",
            dept="Administration",
            instagram_url="https://instagram.com/superadmin",
            linkedin_url="https://linkedin.com/in/superadmin",
            github_url="https://github.com/superadmin",
            image_url="https://picsum.photos/seed/superadmin/300/300",
            json_content={},
            is_member=True,
        )
        pf_admin_user = PdaUser(
            regno="1111111111",
            email="pfadmin@example.com",
            hashed_password=get_password_hash("admin123"),
            name="PF Admin",
            dob=date(2001, 1, 1),
            phno="9111111111",
            dept="Administration",
            instagram_url="https://instagram.com/pfadmin",
            linkedin_url="https://linkedin.com/in/pfadmin",
            github_url="https://github.com/pfadmin",
            image_url="https://picsum.photos/seed/pfadmin/300/300",
            json_content={},
            is_member=True,
        )
        users.extend([super_user, pf_admin_user])
        db.add_all(users)
        db.flush()

        # Sample pending recruitment applications (is_member = False)
        pending_apps = []
        for i in range(5):
            reg = f"2022509{100+i}"
            pending_apps.append(
                PdaUser(
                    regno=reg,
                    email=f"applicant{i+1}@example.com",
                    hashed_password=get_password_hash("pda12345"),
                    name=f"Applicant {i+1}",
                    dob=date(2005, ((i % 12) + 1), ((i % 27) + 1)),
                    gender="Male" if i % 2 == 0 else "Female",
                    phno=f"9{(i+1):09d}"[-10:],
                    dept=depts[(i + 3) % len(depts)].value,
                    instagram_url=f"https://instagram.com/applicant{i+1}",
                    linkedin_url=f"https://linkedin.com/in/applicant{i+1}",
                    github_url=f"https://github.com/applicant{i+1}",
                    image_url=f"https://picsum.photos/seed/applicant{i+1}/300/300",
                    json_content={"preferred_team": "Design" if i % 2 == 0 else "Event Management"},
                    is_member=False,
                )
            )
        db.add_all(pending_apps)

        teams = [
            ("Executive", "Root", super_user),
            ("Executive", "Vice Chairperson", users[0]),
            ("Executive", "General Secretary", users[1]),
            ("Executive", "Treasurer", users[2]),
            ("Content Creation", "Head", users[3]),
            ("Event Management", "Head", users[4]),
            ("Design", "Head", users[5]),
            ("Website Design", "Head", users[6]),
            ("Public Relations", "Head", users[7]),
            ("Podcast", "Head", users[8]),
            ("Library", "Head", users[9]),
            ("Design", "JS", users[10]),
            ("Event Management", "JS", users[11]),
            ("Content Creation", "JS", users[12]),
            ("Website Design", "Member", users[13]),
            ("Public Relations", "Member", users[14]),
            ("Podcast", "Member", users[15]),
            ("Library", "Member", users[16]),
        ]
        for team, desig, u in teams:
            db.add(
                PdaTeam(
                    user_id=u.id,
                    team=team,
                    designation=desig,
                )
            )

        db.add_all(
            [
                PdaAdmin(user_id=super_user.id, policy={"home": True, "superAdmin": True, "events": {}}),
                PdaAdmin(user_id=pf_admin_user.id, policy={"home": False, "events": {}}),
                PdaAdmin(user_id=users[0].id, policy={"home": True, "events": {}}),
            ]
        )

        for i in range(20):
            db.add(
                PdaItem(
                    type="program",
                    title=f"Program {i+1}",
                    description=f"Mock program description {i+1}",
                    tag="Program",
                    poster_url=f"https://picsum.photos/seed/program{i+1}/800/500",
                    start_date=date(2026, ((i % 12) + 1), ((i % 27) + 1)),
                    format="Offline" if i % 2 == 0 else "Online",
                    is_featured=(i == 0),
                    created_at=now,
                )
            )
        for i in range(20):
            db.add(
                PdaItem(
                    type="event",
                    title=f"Event {i+1}",
                    description=f"Mock event description {i+1}",
                    tag="Event",
                    poster_url=f"https://picsum.photos/seed/event{i+1}/800/500",
                    start_date=date(2026, ((i % 12) + 1), ((i % 27) + 1)),
                    end_date=date(2026, ((i % 12) + 1), min(((i % 27) + 3), 28)),
                    format="Offline" if i % 2 == 0 else "Online",
                    hero_caption=f"Hero caption {i+1}",
                    hero_url="https://example.com",
                    is_featured=(i < 3),
                    created_at=now,
                )
            )

        for i in range(40):
            db.add(
                PdaGallery(
                    photo_url=f"https://picsum.photos/seed/gallery{i+1}/900/600",
                    caption=f"Gallery moment {i+1}",
                    order=i,
                    is_featured=(i < 4),
                    created_at=now,
                )
            )

        db.add(
            AdminLog(
                admin_id=super_user.id,
                admin_register_number=super_user.regno,
                admin_name=super_user.name,
                action="seed_database",
                method="SYSTEM",
                path="/seed",
                meta={"seed": 42},
            )
        )

        db.commit()
        print("Truncate + deterministic medium seed completed.")
        print("Superadmin creds: regno=0000000000 password=admin123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
