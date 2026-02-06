#!/usr/bin/env python3
import os
import random
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from auth import get_password_hash
from models import (
    AdminLog,
    Department,
    Event,
    Gender,
    Participant,
    ParticipantStatus,
    PdaAdmin,
    PdaGallery,
    PdaItem,
    PdaTeam,
    PdaUser,
    Round,
    RoundMode,
    RoundState,
    Score,
    SystemConfig,
    UserRole,
    YearOfStudy,
)


def _load_db_url() -> str:
    root = os.path.dirname(os.path.dirname(__file__))
    load_dotenv(os.path.join(root, ".env"))
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL not configured in backend/.env")
    return db_url


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
    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    _truncate_all(engine)

    db = SessionLocal()
    try:
        event = Event(name="PERSOFEST", is_active=True)
        db.add(event)
        db.flush()

        db.add(SystemConfig(key="registration_open", value="true"))

        now = datetime.now(timezone.utc)
        base_date = datetime(2026, 2, 1, tzinfo=timezone.utc)
        criteria = [
            {"name": "Communication", "max_marks": 30},
            {"name": "Aptitude", "max_marks": 30},
            {"name": "Creativity", "max_marks": 40},
        ]

        rounds = []
        round_states = [
            RoundState.PUBLISHED,
            RoundState.ACTIVE,
            RoundState.COMPLETED,
            RoundState.COMPLETED,
            RoundState.PUBLISHED,
            RoundState.DRAFT,
        ]
        for i in range(6):
            r = Round(
                round_no=f"PF{i+1:02d}",
                name=f"Round {i+1}",
                description=f"Mock round {i+1}",
                tags=["Persofest", "Mock"],
                date=base_date + timedelta(days=i * 7),
                mode=RoundMode.ONLINE if i % 2 == 0 else RoundMode.OFFLINE,
                conducted_by=f"Panel {i+1}",
                state=round_states[i],
                evaluation_criteria=criteria,
                elimination_type="top_k" if i in (2, 3) else None,
                elimination_value=40 if i in (2, 3) else None,
                is_frozen=(round_states[i] == RoundState.COMPLETED),
            )
            rounds.append(r)
        db.add_all(rounds)
        db.flush()

        depts = list(Department)
        years = list(YearOfStudy)
        genders = list(Gender)

        participants = []
        for i in range(60):
            reg = f"2026{i+1:06d}"[-10:]
            p = Participant(
                register_number=reg,
                email=f"participant{i+1}@example.com",
                hashed_password=get_password_hash("participant123"),
                name=f"Participant {i+1}",
                phone=f"9{(i+1):09d}"[-10:],
                gender=genders[i % len(genders)],
                department=depts[i % len(depts)],
                year_of_study=years[i % len(years)],
                role=UserRole.PARTICIPANT,
                referral_code=f"R{i+1:04d}",
                referred_by=f"R{i:04d}" if i > 0 and i % 5 == 0 else None,
                referral_count=1 if i % 7 == 0 else 0,
                status=ParticipantStatus.ACTIVE,
                event_id=event.id,
            )
            participants.append(p)
        db.add_all(participants)
        db.flush()

        for ridx in (0, 1, 2, 3):
            for pidx, p in enumerate(participants):
                if pidx % 11 == 0 and ridx >= 2:
                    continue
                comm = (pidx * 3 + ridx * 5) % 30
                apt = (pidx * 5 + ridx * 7) % 30
                cre = (pidx * 7 + ridx * 11) % 40
                total = float(comm + apt + cre)
                score = Score(
                    participant_id=p.id,
                    round_id=rounds[ridx].id,
                    criteria_scores={"Communication": comm, "Aptitude": apt, "Creativity": cre},
                    total_score=total,
                    normalized_score=total,
                    is_present=(pidx % 9 != 0),
                )
                db.add(score)

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
            image_url="https://picsum.photos/seed/pfadmin/300/300",
            json_content={},
            is_member=True,
        )
        users.extend([super_user, pf_admin_user])
        db.add_all(users)
        db.flush()

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
        for idx, (team, desig, u) in enumerate(teams):
            db.add(
                PdaTeam(
                    user_id=u.id,
                    name=u.name,
                    regno=u.regno,
                    dept=u.dept,
                    email=u.email,
                    phno=u.phno,
                    team=team,
                    designation=desig,
                    photo_url=u.image_url,
                    instagram_url=f"https://instagram.com/mock_{idx+1}",
                    linkedin_url=f"https://linkedin.com/in/mock_{idx+1}",
                )
            )

        db.add_all(
            [
                PdaAdmin(regno=super_user.regno, hashed_password=get_password_hash("admin123"), policy={"home": True, "pf": True}),
                PdaAdmin(regno=pf_admin_user.regno, hashed_password=get_password_hash("admin123"), policy={"home": False, "pf": True}),
                PdaAdmin(regno=users[0].regno, hashed_password=get_password_hash("admin123"), policy={"home": True, "pf": False}),
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
        print("Participant creds: regno=2026000001 password=participant123")
        print("PF admin creds: regno=1111111111 password=admin123")
        print("Superadmin creds: regno=0000000000 password=admin123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
